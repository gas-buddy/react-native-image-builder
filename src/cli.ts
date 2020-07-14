#!/usr/bin/env node
import assert from 'assert';
import minimist from 'minimist';
import ImageTransformer from './index';

const argv = minimist(process.argv.slice(2));
const [sourceDirectory, destinationDirectory] = argv._;

const usage = `
USAGE:
  npx react-native-image-builder <source-directory> <destination-directory>
`;

assert(sourceDirectory, usage);
assert(destinationDirectory, usage);

const imageTransformer = new ImageTransformer();

imageTransformer.transform(sourceDirectory, destinationDirectory);
