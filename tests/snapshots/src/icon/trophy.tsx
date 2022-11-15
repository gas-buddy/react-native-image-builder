import * as React from 'react';
import Svg, { SvgProps, Path } from 'react-native-svg';

const DEFAULT_COLORS = ['#052530'];
const ALTERNATE_COLORS = {
  dark: ['#FADACF'],
};

interface SvgPropsWithColor extends SvgProps {
  colors?: string[] | 'dark';
}

function SvgComponent({ colors = DEFAULT_COLORS, ...props }: SvgPropsWithColor) {
  const _c = typeof colors === 'string' ? ALTERNATE_COLORS[colors] || colors : colors;

  return (
    <Svg width={22} height={25} viewBox="0 0 22 25" xmlns="http://www.w3.org/2000/svg" {...props}>
      <Path
        d="M17.793 8.958a7.02 7.02 0 00.103-1.182V2.902h2.198c-.063 1.598-.31 4.44-2.301 6.056zm-6.234 5.428h-.027l-.048.013a4.964 4.964 0 01-1.778-.004l-.05-.009c-1.974-.383-3.757-1.986-4.773-4.299a5.703 5.703 0 01-.481-2.31V1.082h12.41v6.693c0 .808-.162 1.585-.48 2.31-1.018 2.314-2.8 3.917-4.773 4.3zM1.12 2.902h2.197v4.874c0 .401.037.795.103 1.182C1.429 7.341 1.183 4.5 1.12 2.902zm13.767 18.395H6.706v-1.535h8.184l-.002 1.535zm1.718 1.084l-.001 1.535H4.565v-1.535h12.041zm1.29-20.563V0H3.318v1.818H0l.024.726c.053 1.71.194 6.201 3.872 7.99 1.162 2.634 3.236 4.468 5.557 4.917l.049.02h.056c.169.03.339.051.51.066v3.141H6.707c-.598 0-1.084.487-1.084 1.084v1.535H4.566c-.597 0-1.084.486-1.084 1.084v1.535c0 .598.487 1.084 1.084 1.084h12.04c.597 0 1.083-.486 1.083-1.084v-1.535c0-.598-.486-1.084-1.083-1.084h-.633v-1.535c0-.597-.486-1.084-1.083-1.084h-3.751v-3.14c.175-.016.347-.038.519-.069l.05-.009c2.343-.43 4.439-2.27 5.61-4.926 3.678-1.789 3.82-6.28 3.87-7.99l.026-.726h-3.318z"
        fill={_c[0]}
        stroke="none"
        strokeWidth={1}
        fillRule="evenodd"
      />
    </Svg>
  );
}

export default SvgComponent;
