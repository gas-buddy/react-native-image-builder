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
  props: string;
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
  console.log(jsx);
  const typeScriptTpl = template.smart({ plugins });
  return typeScriptTpl.ast`${imports}
${interfaces}
function ${componentName}(${props}) {
  return ${jsx};
}
${exports}
  `;
}
