/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class GANx4UUL implements Anime4KPipeline {
    /**
     * [0-5] conv2d_tf - conv2d_tf5
     * [6-11] conv2d_3_tf - conv2d_3_tf5
     * [12-17] conv2d_6_tf - conv2d_6_tf5
     * [18-23] conv2d_9_tf - conv2d_9_tf5
     * [24-29] conv2d_12_tf - conv2d_12_tf5
     * [30-35] conv2d_15_tf - conv2d_15_tf5
     * [36-41] conv2d_18_tf - conv2d_18_tf5
     * [42-47] conv2d_21_tf - conv2d_21_tf5
     * [48-53] conv2d_24_tf - conv2d_24_tf5
     */
    pipelines6: Anime4KPipeline[];
    /**
     * [0] conv2d_1_tf;
     * [1] conv2d_2_tf;
     * [2] conv2d_4_tf;
     * [3] conv2d_5_tf;
     * [4] conv2d_7_tf;
     * [5] conv2d_8_tf;
     * [6] conv2d_10_tf;
     * [7] conv2d_11_tf;
     * [8] conv2d_13_tf;
     * [9] conv2d_14_tf;
     * [10] conv2d_16_tf;
     * [11] conv2d_17_tf;
     * [12] conv2d_19_tf;
     * [13] conv2d_20_tf;
     * [14] conv2d_22_tf;
     * [15] conv2d_23_tf;
     * [16] conv2d_25_tf;
     */
    pipelines: Anime4KPipeline[];
    /**
     * [0-5] conv0ups - conv0ups5
     * [6-11] overlayConv1ups - overlayConv1ups5
     */
    pipelinesUps: Anime4KPipeline[];
    /**
     * Creates an instance of GANx4UUL.
     *
     * @param {Object} options - The options for the GANx4UUL pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    private fillOutputTexturesFromPipeline6;
    private addOutputTexturesFromPipeline;
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
