import tap from 'tap';
import path from 'path';
import { compareSync } from 'dir-compare';
// TODO not sure why I can't run against src...
import Generator from '../build/index';

tap.test('test_generation', async (test) => {
  const gen = new Generator();
  const tsOutputDir = path.resolve(__dirname, './output/src');
  const imgOutputDir = path.resolve(__dirname, './output/build');
  await gen.transform(path.resolve(__dirname, './images'), tsOutputDir, imgOutputDir);

  const snapshotDir = path.resolve(__dirname, './snapshots');
  const result = compareSync(path.resolve(__dirname, './output'), snapshotDir, {
    compareDate: false,
    compareContent: true,
    compareSize: true,
  });
  test.ok(result.same, 'Output and snapshot directory should be the same.');
  test.end();
});