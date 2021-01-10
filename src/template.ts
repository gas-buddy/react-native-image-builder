import { smart, statement, statements, expression, program } from 'babel__template';
import { ParserPlugin } from '@babel/parser';
import {
  JSXElement,
  JSXText,
  JSXSpreadChild,
  JSXIdentifier,
  JSXExpressionContainer,
  JSXFragment,
} from '@babel/types';

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
  opts: { typescript: object },
  { imports, interfaces, componentName, props, jsx, exports }: astPartsType,
) {
  const plugins: ParserPlugin[] = ['jsx'];

  if (opts.typescript) {
    plugins.push('typescript');
  }

  const hexRegex = RegExp('^#(?:[0-9a-fA-F]{3}){1,2}$');

  const isHex = (value: string) => hexRegex.test(value);

  const isFillStrokeOrStopColor = (name: string | JSXIdentifier) =>
    name === 'fill' || name === 'stroke' || name === 'stopColor';

  const getColorsAndModifyAttr = (coCount: number, attributes: Array<any>) => {
    let colorArray: Array<string> = [];

    attributes.map((attr) => {
      if (attr.value! && isFillStrokeOrStopColor(attr.name.name) && isHex(attr.value.value)) {
        colorArray.push(attr.value.value);
        attr.value.type = 'JSXExpressionContainer';
        attr.value.expression = { type: 'Identifier', name: `colorValue[${coCount}]` };
        coCount++;
      }
      return attr;
    });
    return { coCount, colorArray };
  };

  let count = 0;
  let finalColors: Array<string> = [];
  const loopJsxChildrenAndBuildAttr = (
    children: (JSXElement | JSXText | JSXExpressionContainer | JSXSpreadChild | JSXFragment)[],
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

  const babelTypeColors = finalColors.map((color) => {
    return {
      type: 'StringLiteral',
      value: color,
    };
  });

  const defaultColorsJsx = [
    {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: 'defaultColors',
          },
          init: {
            type: 'ArrayExpression',
            elements: babelTypeColors,
          },
        },
      ],
      kind: 'const',
    },
  ];

  const destructuredProps = props.map((item) => {
    item.name = '{ colors = defaultColors, ...props }: { colors: Array<string>; props: SvgProps }';
    return item;
  });

  const typeScriptTpl = template.smart({ plugins });
  return typeScriptTpl.ast`${imports}
    ${interfaces}

    ${defaultColorsJsx}

    function ${componentName} (${destructuredProps}) {
        return ${finalJsx};
    }
    ${exports}
    `;
}
