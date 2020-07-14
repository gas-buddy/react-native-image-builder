#!/usr/bin/env node
import assert from 'assert';
import minimist from 'minimist';
import ImageTransformer from './index';

const argv = minimist(process.argv.slice(2));
const [imageDirectory, tsOutputDirectory, imageOutputDirectory] = argv._;

const usage = `
USAGE:
  npx react-native-image-builder <image-source-directory> <ts-output-directory> <image-output-directory>
`;

assert(imageDirectory, usage);
assert(tsOutputDirectory, usage);
assert(imageOutputDirectory, usage);

const imageTransformer = new ImageTransformer();

imageTransformer.transform(imageDirectory, tsOutputDirectory, imageOutputDirectory);
