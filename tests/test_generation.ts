import tap from 'tap';
import path from 'path';
import rimraf from 'rimraf';
import { compareSync } from 'dir-compare';
// TODO not sure why I can't run against src...
import Generator from '../build/index';

tap.test('test_generation', (t) => {
  const tsOutputDir = path.resolve(__dirname, './output/src/');
  const imgOutputDir = path.resolve(__dirname, './output/build/');

  t.test('inlineRequires false', async (test) => {
    const gen = new Generator();
    try {
      rimraf.sync(path.resolve(__dirname, './output'));
    } catch (error) {
      // nothing to do
      console.log('Output folder deletion failed', error);
    }
    await gen.transform(path.resolve(__dirname, './images'), tsOutputDir, imgOutputDir);

    const snapshotDir = path.resolve(__dirname, './snapshots/');
    const result = compareSync(path.resolve(__dirname, './output/'), snapshotDir, {
      compareDate: false,
      compareContent: false,
      compareSize: false,
    });
    if (!result.same) {
      result.diffSet = result.diffSet?.filter((d) => d.state !== 'equal');
      console.error(JSON.stringify(result, null, '\t'));
    }
    const result2 = compareSync(path.resolve(__dirname, './output/'), snapshotDir, {
      compareDate: false,
      compareContent: true,
      compareSize: false,
      excludeFilter: '**/*.png',
    });
    if (!result2.same) {
      result2.diffSet = result2.diffSet?.filter((d) => d.state !== 'equal');
      console.error(JSON.stringify(result2, null, '\t'));
    }
    test.ok(result.same, 'Output and snapshot directory should be the same.');
  });

  t.skip('inlineRequires true', async (test) => {
    const gen2 = new Generator({ inlineRequire: true });
    try {
      rimraf.sync(path.resolve(__dirname, './output'));
    } catch (error) {
      // nothing to do
      console.log('Output folder deletion failed', error);
    }
    await gen2.transform(path.resolve(__dirname, './images'), tsOutputDir, imgOutputDir);
    const snapshotDir = path.resolve(__dirname, './inlineSnapshots/');
    const result = compareSync(path.resolve(__dirname, './output/'), snapshotDir, {
      compareDate: false,
      compareContent: false,
      compareSize: true,
    });
    if (!result.same) {
      result.diffSet = result.diffSet?.filter((d) => d.state !== 'equal');
      console.error(JSON.stringify(result, null, '\t'));
    }
    const result2 = compareSync(path.resolve(__dirname, './output/'), snapshotDir, {
      compareDate: false,
      compareContent: true,
      compareSize: false,
      excludeFilter: '**/*.png',
    });
    if (!result2.same) {
      result2.diffSet = result2.diffSet?.filter((d) => d.state !== 'equal');
      console.error(JSON.stringify(result2, null, '\t'));
    }
    test.ok(result.same, 'Output and snapshot directory should be the same.');
  });

  t.end();
});
