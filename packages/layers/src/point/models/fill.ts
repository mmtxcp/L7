import {
  AttributeType,
  gl,
  IAnimateOption,
  IAttribute,
  IElements,
  IEncodeFeature,
  ILayerConfig,
  IModel,
  IModelUniform,
} from '@antv/l7-core';
import BaseModel, {
  styleColor,
  styleOffset,
  styleSingle,
} from '../../core/BaseModel';
import {
  GlobelPointFillTriangulation,
  PointFillTriangulation,
} from '../../core/triangulation';
import pointFillFrag from '../shaders/fill_frag.glsl';
import pointFillVert from '../shaders/fill_vert.glsl';

import { isNumber } from 'lodash';

import { mat4, vec3 } from 'gl-matrix';

interface IPointLayerStyleOptions {
  opacity: styleSingle;
  strokeWidth: styleSingle;
  stroke: styleColor;
  strokeOpacity: styleSingle;
  offsets: styleOffset;
}
// 判断当前使用的 style 中的变量属性是否需要进行数据映射
export default class FillModel extends BaseModel {
  public getUninforms(): IModelUniform {
    const {
      opacity = 1,
      strokeOpacity = 1,
      strokeWidth = 0,
      stroke = 'rgba(0,0,0,0)',
      offsets = [0, 0],
    } = this.layer.getLayerConfig() as IPointLayerStyleOptions;

    if (
      this.dataTextureTest &&
      this.dataTextureNeedUpdate({
        opacity,
        strokeOpacity,
        strokeWidth,
        stroke,
        offsets,
      })
    ) {
      // 判断当前的样式中哪些是需要进行数据映射的，哪些是常量，同时计算用于构建数据纹理的一些中间变量
      this.judgeStyleAttributes({
        opacity,
        strokeOpacity,
        strokeWidth,
        stroke,
        offsets,
      });

      const encodeData = this.layer.getEncodedData();
      const { data, width, height } = this.calDataFrame(
        this.cellLength,
        encodeData,
        this.cellProperties,
      );
      this.rowCount = height; // 当前数据纹理有多少行

      this.dataTexture =
        this.cellLength > 0 && data.length > 0
          ? this.createTexture2D({
              flipY: true,
              data,
              format: gl.LUMINANCE,
              type: gl.FLOAT,
              width,
              height,
            })
          : this.createTexture2D({
              flipY: true,
              data: [1],
              format: gl.LUMINANCE,
              type: gl.FLOAT,
              width: 1,
              height: 1,
            });
    }
    return {
      u_globel: this.mapService.version === 'GLOBEL' ? 1 : 0,
      u_dataTexture: this.dataTexture, // 数据纹理 - 有数据映射的时候纹理中带数据，若没有任何数据映射时纹理是 [1]
      u_cellTypeLayout: this.getCellTypeLayout(),

      u_opacity: isNumber(opacity) ? opacity : 1.0,
      u_stroke_opacity: isNumber(strokeOpacity) ? strokeOpacity : 1.0,
      u_stroke_width: isNumber(strokeWidth) ? strokeWidth : 0.0,
      u_stroke_color: this.getStrokeColor(stroke),
      u_offsets: this.isOffsetStatic(offsets)
        ? (offsets as [number, number])
        : [0, 0],
    };
  }
  public getAnimateUniforms(): IModelUniform {
    const { animateOption } = this.layer.getLayerConfig() as ILayerConfig;
    return {
      u_aimate: this.animateOption2Array(animateOption as IAnimateOption),
      u_time: this.layer.getLayerAnimateTime(),
    };
  }

  public getAttribute(): {
    attributes: {
      [attributeName: string]: IAttribute;
    };
    elements: IElements;
  } {
    return this.styleAttributeService.createAttributesAndIndices(
      this.layer.getEncodedData(),
      PointFillTriangulation,
    );
  }

  public initModels(): IModel[] {
    return this.buildModels();
  }

  public buildModels(): IModel[] {
    // TODO: 判断当前的点图层的模型是普通地图模式还是地球模式
    const isGlobel = this.mapService.version === 'GLOBEL';
    return [
      this.layer.buildLayerModel({
        moduleName: 'pointfill',
        vertexShader: pointFillVert,
        fragmentShader: pointFillFrag,
        triangulation: isGlobel
          ? GlobelPointFillTriangulation
          : PointFillTriangulation,
        // depth: { enable: false },
        depth: { enable: isGlobel },
        blend: this.getBlend(),
      }),
    ];
  }

  public clearModels() {
    this.dataTexture?.destroy();
  }

  protected animateOption2Array(option: IAnimateOption): number[] {
    return [option.enable ? 0 : 1.0, option.speed || 1, option.rings || 3, 0];
  }
  protected registerBuiltinAttributes() {
    // TODO: 判断当前的点图层的模型是普通地图模式还是地球模式
    const isGlobel = this.mapService.version === 'GLOBEL';

    this.styleAttributeService.registerStyleAttribute({
      name: 'extrude',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_Extrude',
        buffer: {
          // give the WebGL driver a hint that this buffer may change
          usage: gl.DYNAMIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 3,
        update: (
          feature: IEncodeFeature,
          featureIdx: number,
          vertex: number[],
          attributeIdx: number,
        ) => {
          let extrude;
          // 地球模式
          if (isGlobel) {
            const [x, y, z] = vertex;
            const n1 = vec3.fromValues(0, 0, 1);
            const n2 = vec3.fromValues(x, 0, z);

            const xzReg =
              x >= 0 ? vec3.angle(n1, n2) : Math.PI * 2 - vec3.angle(n1, n2);

            const yReg = Math.PI * 2 - Math.asin(y / 100);

            const m = mat4.create();
            mat4.rotateY(m, m, xzReg);
            mat4.rotateX(m, m, yReg);

            const v1 = vec3.fromValues(1, 1, 0);
            vec3.transformMat4(v1, v1, m);
            vec3.normalize(v1, v1);

            const v2 = vec3.fromValues(-1, 1, 0);
            vec3.transformMat4(v2, v2, m);
            vec3.normalize(v2, v2);

            const v3 = vec3.fromValues(-1, -1, 0);
            vec3.transformMat4(v3, v3, m);
            vec3.normalize(v3, v3);

            const v4 = vec3.fromValues(1, -1, 0);
            vec3.transformMat4(v4, v4, m);
            vec3.normalize(v4, v4);

            extrude = [...v1, ...v2, ...v3, ...v4];
          } else {
            // 平面模式
            extrude = [1, 1, 0, -1, 1, 0, -1, -1, 0, 1, -1, 0];
          }

          const extrudeIndex = (attributeIdx % 4) * 3;
          return [
            extrude[extrudeIndex],
            extrude[extrudeIndex + 1],
            extrude[extrudeIndex + 2],
          ];
        },
      },
    });

    // point layer size;
    this.styleAttributeService.registerStyleAttribute({
      name: 'size',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_Size',
        buffer: {
          // give the WebGL driver a hint that this buffer may change
          usage: gl.DYNAMIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 1,
        update: (
          feature: IEncodeFeature,
          featureIdx: number,
          vertex: number[],
          attributeIdx: number,
        ) => {
          const { size = 5 } = feature;
          // console.log('featureIdx', featureIdx, feature)
          return Array.isArray(size) ? [size[0]] : [size as number];
        },
      },
    });

    // point layer size;
    this.styleAttributeService.registerStyleAttribute({
      name: 'shape',
      type: AttributeType.Attribute,
      descriptor: {
        name: 'a_Shape',
        buffer: {
          // give the WebGL driver a hint that this buffer may change
          usage: gl.DYNAMIC_DRAW,
          data: [],
          type: gl.FLOAT,
        },
        size: 1,
        update: (
          feature: IEncodeFeature,
          featureIdx: number,
          vertex: number[],
          attributeIdx: number,
        ) => {
          const { shape = 2 } = feature;
          const shape2d = this.layer.getLayerConfig().shape2d as string[];
          const shapeIndex = shape2d.indexOf(shape as string);
          return [shapeIndex];
        },
      },
    });
  }
}
