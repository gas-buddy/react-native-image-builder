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
import templateF from './template';

const glob = util.promisify(globCb);

const jsHeader = '/* THIS IS AN AUTO-GENERATED FILE BY util/build-images.js - DO NOT EDIT */\n';
const noTsCheckSvgPreamble = '// @ts-nocheck\n';

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

// function fixTsProps(svgrOutput: string) {
//   return svgrOutput
//     .replace(
//       /Svg, {\s*([\s\S]*)\s*} from/,
//       (match, dollar1) => `Svg, { SvgProps, ${dollar1.trim()} } from`,
//     )
//     .replace(/SvgComponent\(props/, 'SvgComponent(props: SvgProps');
// }

function fixRenderingBugs(svgrOutput: string) {
  return xmlnsSvgToXmlns(xlinkHrefToHref(svgrOutput));
}

const defaultsvgrConfig = {
  native: true,
  template: templateF,
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

export interface GeneratorOptions {
  disableTsCheck?: boolean;
  inlineRequire?: boolean;
}

export default class ImageTransformer {
  indexes: { [key: string]: any } = { '': {} };

  flatIndex?: { png: Array<any>; svg: Array<any> };

  svgPreamble = '';

  constructor(options?: GeneratorOptions) {
    const { disableTsCheck = false, inlineRequire = false } = options || {};
    if (disableTsCheck) {
      this.svgPreamble = noTsCheckSvgPreamble;
    }
    if (inlineRequire) {
      this.flatIndex = { png: [], svg: [] };
    }
  }

  addIndex(dir: string, name: string, type: 'svg' | 'png' | 'dir') {
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
            case 'png':
              return `export const ${safeName(name)} = require('./${name}.png');`;
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
    const png = this.flatIndex!.png;
    const svg = this.flatIndex!.svg;
    const lines = [
      '/* eslint-disable prettier/prettier, quotes */',
      "import { SvgProps } from 'react-native-svg';",
      "import { ImageSourcePropType } from 'react-native';",
      '',
    ];
    lines.push(
      `export type Bitmaps = ${png
        .map((ln) => JSON.stringify(ln))
        .join(' |\n  ')
        .trim()};`,
    );
    lines.push('');
    lines.push(
      `export type Vectors = ${svg
        .map((ln) => JSON.stringify(ln))
        .join(' |\n  ')
        .trim()};`,
    );

    lines.push(
      '',
      'export function getBitmap(name: Bitmaps): ImageSourcePropType {',
      '  switch (name) {',
      png
        .map((ln) => `    case ${JSON.stringify(ln)}:\n      return require('./${ln}.png');`)
        .join('\n'),
      '  }',
      '}',
      '',
    );

    lines.push(
      '',
      'export function getVector(name: Vectors): ((props: SvgProps) => JSX.Element) {',
      '  switch (name) {',
      svg
        .map((ln) => `    case ${JSON.stringify(ln)}:\n      return require('./${ln}').default;`)
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
      this.transformSvgs(inputDirectory, tsOutputDirectory),
      this.transformPngs(inputDirectory, imageOutputDirectory),
    ]);
    if (this.flatIndex) {
      this.writeInlineRequireIndex(tsOutputDirectory);
    } else {
      this.writeIndex(tsOutputDirectory);
    }
  }

  async transformSvgs(inputDirectory: string, outputDirectory: string) {
    const svgs = await glob('**/*.svg?(x)', { cwd: inputDirectory });
    svgs.forEach((file) => {
      const inputFile = path.join(inputDirectory, file);
      const outputFile = path.join(outputDirectory, file).replace(/.svgx?$/, '.tsx');
      const outDir = path.dirname(outputFile);
      const relOutput = path.relative(outputDirectory, outDir);
      this.addIndex(relOutput, path.basename(outputFile).replace(/.tsx$/, ''), 'svg');
      if (needsUpdate(inputFile, outputFile)) {
        console.log('Generating JS from SVG', file);
        const code = transformSvg(inputFile);
        mkdirp.sync(outDir);
        fs.writeFileSync(outputFile, `${this.svgPreamble}${code}`, 'utf8');
      }
    });
  }

  async transformPngs(inputDirectory: string, imageOutputDirectory: string) {
    const files = await glob('**/*.png', { cwd: inputDirectory });

    await pmap(
      files,
      async (file) => {
        const inputFile = path.join(inputDirectory, file);
        const [baseName, dims] = file
          .substring(0, file.length - path.extname(file).length)
          .split('@');
        const output3x = `${baseName}@3x.png`;
        this.addIndex(path.dirname(file), path.basename(baseName), 'png');
        if (needsUpdate(inputFile, path.join(imageOutputDirectory, output3x))) {
          const sharpImage = sharp(inputFile);
          let { width, height } = await sharpImage.metadata();
          if (dims && dims.indexOf('x') > 0) {
            [width, height] = dims.split('x').map((n) => Number(n));
          }
          if (width! % 3 || height! % 3 || (height! * 2) % 3 || (width! * 2) % 3) {
            console.error(`${file} dimensions cannot be properly scaled to 1/3rd and 2/3rd size`);
          }
          mkdirp.sync(path.dirname(path.join(imageOutputDirectory, file)));
          console.log('Preparing image', file);
          await Promise.all([
            sharpImage
              .clone()
              .resize({ width, height })
              .toFile(path.join(imageOutputDirectory, output3x)),
            sharpImage
              .clone()
              .resize({ width: (width! * 2) / 3, height: (height! * 2) / 3 })
              .toFile(path.join(imageOutputDirectory, `${baseName}@2x.png`)),
            sharpImage
              .clone()
              .resize({ width: width! / 3, height: height! / 3 })
              .toFile(path.join(imageOutputDirectory, `${baseName}.png`)),
          ]);
        }
      },
      { concurrency: 5 },
    );
  }
}
