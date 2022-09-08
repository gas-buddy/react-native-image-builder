import fs from 'fs';
import util from 'util';
import path from 'path';
import pmap from 'p-map';
import globCb from 'glob';
import sharp from 'sharp';
import mkdirp from 'mkdirp';
import camelCase from 'lodash.camelcase';
import upperFirst from 'lodash.upperfirst';
import svgr, { resolveConfig } from '@svgr/core';
import gbTemplate from './template';

const glob = util.promisify(globCb);

const jsHeader = '/* THIS IS AN AUTO-GENERATED FILE BY util/build-images.js - DO NOT EDIT */\n';
const noTsCheckSvgPreamble = '// @ts-nocheck\n';

const pngOptions = {
  compressionLevel: 9,
  palette: true,
  effort: 10,
};

const jpgOptions = {
  effort: 10,
  reoptimize: true,
};

// Portions from https://github.com/kristerkari/react-native-svg-transformer/blob/master/index.js

// xlink:href is supported in react-native-svg
// starting from version 9.0.4.
//
// TODO: remove this fix in v1.0.0.
function xlinkHrefToHref(svgrOutput: string) {
  return svgrOutput.replace(/xlinkHref=/g, 'href=');
}

function xmlnsSvgToXmlns(svgrOutput: string) {
  return svgrOutput.replace(/xmlns:svg=/gi, 'xmlns=');
}

function adjustSvgPropImport(svgrOutput: string) {
  return svgrOutput.replace(
    /Svg, {\s*([\s\S]*)\s*} from/,
    (match, dollar1) => `Svg, { SvgProps, ${dollar1.trim()} } from`,
  );
}

function fixRenderingBugs(svgrOutput: string) {
  return adjustSvgPropImport(xmlnsSvgToXmlns(xlinkHrefToHref(svgrOutput)));
}

function platformIndependentName(f: string) {
  return f.replace('\\', '/');
}

const defaultsvgrConfig = {
  native: true,
  template: gbTemplate,
  plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx', '@svgr/plugin-prettier'],
  svgoConfig: {
    plugins: [
      {
        inlineStyles: {
          onlyMatchedOnce: false,
        },
      },
      {
        removeViewBox: false,
      },
      {
        removeUnknownsAndDefaults: false,
      },
      {
        convertColors: false,
      },
    ],
  },
};

function needsUpdate(infile: string, outfile: string) {
  if (!fs.existsSync(outfile)) {
    return true;
  }
  const outStat = fs.statSync(outfile);
  const inStat = fs.statSync(infile);
  return inStat.mtimeMs > outStat.mtimeMs;
}

function transformSvg(filename: string) {
  const config = resolveConfig.sync(path.dirname(filename));
  var svgrConfig = config ? Object.assign({}, defaultsvgrConfig, config) : defaultsvgrConfig;
  const jsCode = svgr.sync(fs.readFileSync(filename, 'utf8'), svgrConfig);
  return fixRenderingBugs(jsCode);
}

function safeName(name: string) {
  return upperFirst(camelCase(name));
}

async function resizeOriginal(
  sharpImage: ReturnType<typeof sharp>,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  originalSize: number,
) {
  const resized = sharpImage.clone().resize({ width, height });
  const newSize = (await resized.png(pngOptions).toBuffer()).length;
  if (originalWidth === width && originalHeight === height && newSize > originalSize) {
    return sharpImage;
  }
  return resized;
}

export interface GeneratorOptions {
  disableTsCheck?: boolean;
  inlineRequire?: boolean;
}

export default class ImageTransformer {
  indexes: { [key: string]: any } = { '': {} };

  flatIndex?: { jpg: Array<any>; png: Array<any>; svg: Array<any> };

  imageSizes: Record<string, [number, number]> = {};

  svgPreamble = '';

  constructor(options?: GeneratorOptions) {
    const { disableTsCheck = false, inlineRequire = false } = options || {};
    if (disableTsCheck) {
      this.svgPreamble = noTsCheckSvgPreamble;
    }
    if (inlineRequire) {
      this.flatIndex = { jpg: [], png: [], svg: [] };
    }
  }

  addIndex(dir: string, name: string, type: 'svg' | 'png' | 'jpg' | 'dir') {
    if (type !== 'dir' && this.flatIndex) {
      this.flatIndex[type].push(dir === '.' ? name : `${dir}/${name}`);
    }
    const indexDir = dir === '.' ? '' : dir;
    this.indexes[indexDir] = this.indexes[indexDir] || {};
    this.indexes[indexDir][name] = type;
    if (dir === '.') {
      // Nothing more to do
      return;
    }
    const parent = path.dirname(dir);
    if (parent === '.') {
      this.indexes[''][dir] = 'dir';
    } else {
      this.addIndex(parent, path.basename(dir), 'dir');
    }
  }

  writeIndex(outputDirectory: string) {
    Object.entries(this.indexes).forEach(([relativeDir, content]) => {
      const index = Object.entries(content)
        .map(([name, type]) => {
          switch (type) {
            case 'svg':
              return `export { default as ${name} } from './${name}';`;
            case 'dir':
              return `export * from './${name}';`;
            case 'jpg':
              return `export const ${safeName(name)} = require('./${name}.jpg');
export const ${safeName(name)}$size = [${this.imageSizes[name].join(', ')}];`;
            case 'png':
              return `export const ${safeName(name)} = require('./${name}.png');
export const ${safeName(name)}$size = [${this.imageSizes[name].join(', ')}];`;
          }
          return '';
        })
        .concat([''])
        .join('\n');
      const indexPath = path.join(outputDirectory, relativeDir, 'index.ts');
      const finalText = `${jsHeader}${index}`;
      if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf8') !== finalText) {
        mkdirp.sync(path.dirname(indexPath));
        fs.writeFileSync(indexPath, finalText, 'utf8');
      }
    });
  }

  writeInlineRequireIndex(outputDirectory: string) {
    const jpg = this.flatIndex!.jpg;
    const png = this.flatIndex!.png;
    const svg = this.flatIndex!.svg;
    const lines = [
      '/* eslint-disable prettier/prettier, quotes */',
      '/* global JSX */',
      "import { useMemo } from 'react';",
      "import { SvgProps } from 'react-native-svg';",
      "import { ImageSourcePropType } from 'react-native';",
      '',
    ];
    lines.push(
      `export type Bitmaps = ${png
        .map((ln) => JSON.stringify(ln))
        .join(' |\n  ')
        .trim()}${jpg.length > 0 ? ' | ' : ''}
        ${jpg
          .map((ln) => JSON.stringify(platformIndependentName(ln)))
          .join(' |\n  ')
          .trim()};`,
    );
    lines.push('');
    lines.push(
      `export type Vectors = ${svg
        .map((ln) => JSON.stringify(platformIndependentName(ln)))
        .join(' |\n  ')
        .trim()};`,
    );
    lines.push(
      '',
      'export interface SvgPropsWithColor extends SvgProps {',
      '  colors?: string[];',
      '}',
    );

    lines.push(
      '',
      'export function getBitmap(name: Bitmaps): ImageSourcePropType {',
      '  switch (name) {',
      png
        .map(
          (ln) =>
            `    case ${JSON.stringify(
              platformIndependentName(ln),
            )}:\n      return require('./${platformIndependentName(ln)}.png');`,
        )
        .join('\n'),
      jpg
        .map(
          (ln) =>
            `    case ${JSON.stringify(
              platformIndependentName(ln),
            )}:\n      return require('./${platformIndependentName(ln)}.jpg');`,
        )
        .join('\n'),
      '  }',
      '}',
      '',
    );

    lines.push(
      '',
      'export const ImageSizes = {',
      ...Object.entries(this.imageSizes)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([n, v]) => `  ${JSON.stringify(n)}: [${v.join(', ')}],`),
      '};',
      '',
    );

    lines.push(
      '',
      'export function getVector(name: Vectors): ((_: SvgPropsWithColor) => JSX.Element) {',
      '  switch (name) {',
      svg
        .map(
          (ln) =>
            `    case ${JSON.stringify(
              platformIndependentName(ln),
            )}:\n      return require('./${platformIndependentName(ln)}').default;`,
        )
        .join('\n'),
      '  }',
      '}',
      '',
    );

    lines.push(`
export function getVectors(...names: Array<Vectors>) {
  return names.map(getVector);
}

export function getBitmaps(...names: Array<Bitmaps>) {
  return names.map(getBitmap);
}

export function useVector(name: Vectors) {
  return useMemo(() => getVector(name), [name]);
}

export function useVectors(...names: Array<Vectors>) {
  return useMemo(() => names.map(getVector), [names]);
}

export function useBitmap(name: Bitmaps) {
  return useMemo(() => getBitmap(name), [name]);
}

export function useBitmaps(...names: Array<Bitmaps>) {
  return useMemo(() => names.map(getBitmap), [names]);
}
`);

    const indexPath = path.join(outputDirectory, 'index.ts');
    const finalText = lines.join('\n');
    if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf8') !== finalText) {
      mkdirp.sync(path.dirname(indexPath));
      fs.writeFileSync(indexPath, finalText, 'utf8');
    }
  }

  async transform(inputDirectory: string, tsOutputDirectory: string, imageOutputDirectory: string) {
    await Promise.all([
      this.transformSvgs(inputDirectory, tsOutputDirectory, imageOutputDirectory),
      this.transformImages('png', inputDirectory, imageOutputDirectory),
      this.transformImages('jpg', inputDirectory, imageOutputDirectory),
    ]);
    if (this.flatIndex) {
      this.writeInlineRequireIndex(tsOutputDirectory);
    } else {
      this.writeIndex(tsOutputDirectory);
    }
  }

  async transformSvgs(
    inputDirectory: string,
    outputDirectory: string,
    imageOutputDirectory: string,
  ) {
    const svgs = await glob('**/*.svg?(x)', { cwd: inputDirectory });
    await pmap(
      svgs,
      async (file) => {
        const inputFile = path.join(inputDirectory, file);
        const dimMatch = file.match(/(.*)@(\d+)x(\d+)\.svg/i);
        let destFile = file;

        if (dimMatch) {
          destFile = `${dimMatch[1]}.svg`;
          const pngBaseName = dimMatch[1];
          const width = Number(dimMatch[2]);
          const height = Number(dimMatch[3]);

          if (
            needsUpdate(inputFile, path.join(imageOutputDirectory, `${pngBaseName}.png`)) ||
            needsUpdate(inputFile, path.join(imageOutputDirectory, `${pngBaseName}@2x.png`)) ||
            needsUpdate(inputFile, path.join(imageOutputDirectory, `${pngBaseName}@3x.png`))
          ) {
            console.log('Generating PNGs from SVG', file, inputFile);
            const svgInput = fs.readFileSync(inputFile);
            const image = sharp(svgInput);
            const metadata = await image.metadata();
            const fullResImage = await sharp(svgInput, { density: metadata.density! * 3 });
            this.addIndex(path.dirname(file), path.basename(dimMatch[1]), 'png');
            this.imageSizes[this.flatIndex ? dimMatch[1] : path.basename(dimMatch[1])] = [
              width,
              height,
            ];
            mkdirp.sync(path.dirname(path.join(imageOutputDirectory, file)));
            await Promise.all([
              fullResImage
                .clone()
                .resize({ width, height })
                .png(pngOptions)
                .toFile(path.join(imageOutputDirectory, `${pngBaseName}.png`)),
              fullResImage
                .clone()
                .resize({ width: width * 2, height: height * 2 })
                .png(pngOptions)
                .toFile(path.join(imageOutputDirectory, `${pngBaseName}@2x.png`)),
              fullResImage
                .clone()
                .resize({ width: width * 3, height: height * 3 })
                .png(pngOptions)
                .toFile(path.join(imageOutputDirectory, `${pngBaseName}@3x.png`)),
            ]);
          } else {
            this.addIndex(path.dirname(file), path.basename(dimMatch[1]), 'png');
          }
        }

        const outputFile = path.join(outputDirectory, destFile).replace(/.svgx?$/, '.tsx');
        const outDir = path.dirname(outputFile);
        const relOutput = path.relative(outputDirectory, outDir);
        this.addIndex(relOutput, path.basename(outputFile).replace(/.tsx$/, ''), 'svg');
        if (needsUpdate(inputFile, outputFile)) {
          console.log('Generating JS from SVG', file);
          const code = transformSvg(inputFile);
          mkdirp.sync(outDir);
          fs.writeFileSync(outputFile, `${this.svgPreamble}${code}`, 'utf8');
        }
      },
      { concurrency: 5 },
    );
  }

  async transformImages(type: 'png' | 'jpg', inputDirectory: string, imageOutputDirectory: string) {
    const files = await glob(`**/*.${type}`, { cwd: inputDirectory });

    await pmap(
      files,
      async (file) => {
        const inputFile = path.join(inputDirectory, file);
        const [baseName, dims] = file
          .substring(0, file.length - path.extname(file).length)
          .split('@');
        const output3x = `${baseName}@3x.${type}`;
        this.addIndex(path.dirname(file), path.basename(baseName), type);

        const sharpImage = sharp(inputFile);
        let { width, height } = await sharpImage.metadata();
        const [originalWidth, originalHeight] = [width, height];
        if (dims && dims.indexOf('x') > 0) {
          [width, height] = dims.split('x').map((n) => Number(n));
        }
        this.imageSizes[this.flatIndex ? baseName : path.basename(baseName)] = [
          width! / 3,
          height! / 3,
        ];

        if (needsUpdate(inputFile, path.join(imageOutputDirectory, output3x))) {
          const size = fs.statSync(inputFile).size;
          if (width! % 3 || height! % 3 || (height! * 2) % 3 || (width! * 2) % 3) {
            console.error(`${file} dimensions cannot be properly scaled to 1/3rd and 2/3rd size`);
          }
          mkdirp.sync(path.dirname(path.join(imageOutputDirectory, file)));
          console.log('Preparing image', file);
          await Promise.all([
            resizeOriginal(
              sharpImage,
              width!,
              height!,
              originalWidth!,
              originalHeight!,
              size!,
            ).then((sharpResized) =>
              sharpResized[type === 'png' ? 'png' : 'jpeg'](
                type === 'png' ? pngOptions : jpgOptions,
              ).toFile(path.join(imageOutputDirectory, output3x)),
            ),
            sharpImage
              .clone()
              .resize({ width: (width! * 2) / 3, height: (height! * 2) / 3 })
              [type === 'png' ? 'png' : 'jpeg'](type === 'png' ? pngOptions : jpgOptions)
              .toFile(path.join(imageOutputDirectory, `${baseName}@2x.${type}`)),
            sharpImage
              .clone()
              .resize({ width: width! / 3, height: height! / 3 })
              [type === 'png' ? 'png' : 'jpeg'](type === 'png' ? pngOptions : jpgOptions)
              .toFile(path.join(imageOutputDirectory, `${baseName}.${type}`)),
          ]);
        }
      },
      { concurrency: 5 },
    );
  }
}
