import { storiesOf } from '@storybook/react';
import * as React from 'react';
import AMapModel from './Components/amap_three';
import AMap2Model from './Components/amap2_three';
import MapboxModel from './Components/mapbox_three';
import ThreeRender from './Components/threeRender';

storiesOf('3D 模型', module)
  .add('ThreeJS Render', () => <ThreeRender />, {})
  .add('高德模型1.x', () => <AMapModel />, {})
  .add('高德模型2.x', () => <AMap2Model />, {})
  .add('Mapbox模型', () => <MapboxModel />, {});
