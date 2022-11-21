import * as T from '@babel/types';
import { smart, statement, statements, expression, program } from 'babel__template';
import { ParserPlugin } from '@babel/parser';

interface templateType {
  smart: typeof smart;
  statement: typeof statement;
  statements: typeof statements;
  expressions: typeof expression;
  program: typeof program;
  ast: typeof smart.ast;
}

interface astPartsType {
  imports: string;
  interfaces: string;
  componentName: string;
  props: Array<any>;
  jsx: string;
  exports: string;
}

export default function gbTemplate(
  { template }: { template: templateType },
  opts: { typescript: object; colorMap?: Record<string, Record<string, string> | string[]> },
  { imports, interfaces, componentName, props, jsx, exports }: astPartsType,
) {
  const plugins: ParserPlugin[] = ['jsx'];
  if (opts.typescript) {
    plugins.push('typescript');
  }

  const hexRegex = RegExp('^#(?:[0-9a-fA-F]{3}){1,2}$');

  const isHex = (value: string) => hexRegex.test(value);

  const isFillStrokeOrStopColor = (name: string | T.JSXIdentifier) =>
    name === 'fill' || name === 'stroke' || name === 'stopColor';

  const getColorsAndModifyAttr = (coCount: number, attributes: Array<any>) => {
    let colorArray: Array<string> = [];

    attributes.map((attr) => {
      if (attr.value! && isFillStrokeOrStopColor(attr.name.name) && isHex(attr.value.value)) {
        colorArray.push(attr.value.value);
        attr.value.type = 'JSXExpressionContainer';
        attr.value.expression = { type: 'Identifier', name: `_c[${coCount}]` };
        coCount++;
      }
      return attr;
    });
    return { coCount, colorArray };
  };

  let count = 0;
  let finalColors: Array<string> = [];
  const loopJsxChildrenAndBuildAttr = (
    children: (
      | T.JSXElement
      | T.JSXText
      | T.JSXExpressionContainer
      | T.JSXSpreadChild
      | T.JSXFragment
    )[],
  ) => {
    children.forEach((childElement: any) => {
      if (childElement.openingElement.attributes.length > 0) {
        const { coCount, colorArray } = getColorsAndModifyAttr(
          count,
          childElement.openingElement.attributes,
        );
        count = coCount;
        finalColors.push(...colorArray);
      }
      if (childElement.children.length > 0) {
        loopJsxChildrenAndBuildAttr(childElement.children);
      }
    });
  };

  const finalJsx = JSON.parse(JSON.stringify(jsx));

  loopJsxChildrenAndBuildAttr(finalJsx.children);

  const babelTypeColors = finalColors.map((color) => T.stringLiteral(color));

  const defaultColorsJsx: T.VariableDeclaration[] = [
    T.variableDeclaration('const', [
      T.variableDeclarator(T.identifier('DEFAULT_COLORS'), T.arrayExpression(babelTypeColors)),
    ]),
  ];

  const hasColorMap = opts.colorMap && Object.keys(opts.colorMap).length > 0;
  if (hasColorMap) {
    const objectProps = Object.entries(opts.colorMap!).map(([mapName, valueMap]) => {
      return T.objectProperty(
        T.identifier(mapName),
        T.arrayExpression(
          Array.isArray(valueMap)
            ? valueMap.map((color) => T.stringLiteral(color))
            : babelTypeColors.map(({ value: color }) => T.stringLiteral(valueMap[color] || color)),
        ),
      );
    });
    defaultColorsJsx.push(
      T.variableDeclaration('const', [
        T.variableDeclarator(T.identifier('ALTERNATE_COLORS'), T.objectExpression(objectProps)),
      ]),
    );
  }

  const propInterface = [
    T.interfaceDeclaration(
      T.identifier('SvgPropsWithColor'),
      null,
      [T.interfaceExtends(T.identifier('SvgProps'))],
      T.objectTypeAnnotation([
        T.objectTypeProperty(
          T.identifier('colors?'),
          T.unionTypeAnnotation([
            T.arrayTypeAnnotation(T.stringTypeAnnotation()),
            // I don't particularly like this, I'd rather do keyof ALTERNATE_COLORS,
            // but I can't figure out how
            ...(hasColorMap ? Object.keys(opts.colorMap!).map(T.stringLiteralTypeAnnotation) : []),
          ]),
        ),
      ]),
    ),
  ];

  const destructuredProps = props.map((item) => {
    item.name = '{ colors = DEFAULT_COLORS, ...props }: SvgPropsWithColor';
    return item;
  });

  const colorVarValue = hasColorMap
    ? T.conditionalExpression(
        T.binaryExpression(
          '===',
          T.unaryExpression('typeof', T.identifier('colors')),
          T.stringLiteral('string'),
        ),
        T.parenthesizedExpression(
          T.logicalExpression(
            '||',
            T.memberExpression(T.identifier('ALTERNATE_COLORS'), T.identifier('colors'), true),
            T.identifier('colors'),
          ),
        ),
        T.identifier('colors'),
      )
    : T.identifier('colors');
  const colorSetup = T.variableDeclaration('const', [
    T.variableDeclarator(T.identifier('_c'), colorVarValue),
  ]);
  const typeScriptTpl = template.smart({ plugins });
  return typeScriptTpl.ast`${imports}
    ${interfaces}
    ${'\n'}
    ${defaultColorsJsx}
    ${'\n'}
    ${propInterface}

    function ${componentName} (${destructuredProps}) {
        ${colorSetup}
        return ${finalJsx};
    }
    ${exports}
    `;
}
