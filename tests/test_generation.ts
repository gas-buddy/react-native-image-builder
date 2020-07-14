import tap from 'tap';
import path from 'path';
import { compareSync } from 'dir-compare';
// TODO not sure why I can't run against src...
import Generator from '../build/index';

tap.test('test_generation', async (test) => {
  const gen = new Generator();
  const outputDir = path.resolve(__dirname, './output');
  await gen.transform(path.resolve(__dirname, './images'), outputDir);

  const snapshotDir = path.resolve(__dirname, './snapshots');
  const result = compareSync(outputDir, snapshotDir, {
    compareDate: false,
    compareContent: true,
    compareSize: true,
  });
  test.ok(result.same, 'Output and snapshot directory should be the same.');
  test.end();
});
