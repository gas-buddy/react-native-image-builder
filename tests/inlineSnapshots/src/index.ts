/* eslint-disable prettier/prettier, quotes */
/* global JSX */
import { SvgProps } from 'react-native-svg';
import { ImageSourcePropType } from 'react-native';

export type Bitmaps = "filters-all" |
  "icon/thirdlevel/cats" |
  "icon/makemeanimage"
        ;

export type Vectors = "icon/trophy" |
  "icon/makemeanimage";

export function getBitmap(name: Bitmaps): ImageSourcePropType {
  switch (name) {
    case "filters-all":
      return require('./filters-all.png');
    case "icon/thirdlevel/cats":
      return require('./icon/thirdlevel/cats.png');
    case "icon/makemeanimage":
      return require('./icon/makemeanimage.png');

  }
}


export function getVector(name: Vectors): ((_: SvgProps) => JSX.Element) {
  switch (name) {
    case "icon/trophy":
      return require('./icon/trophy').default;
    case "icon/makemeanimage":
      return require('./icon/makemeanimage').default;
  }
}


export function getVectors(...names: Array<Vectors>) {
  return names.map(getVector);
}

export function getBitmaps(...names: Array<Bitmaps>) {
  return names.map(getBitmap);
}
