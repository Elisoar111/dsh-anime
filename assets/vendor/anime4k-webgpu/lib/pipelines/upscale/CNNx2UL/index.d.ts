/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class CNNx2UL implements Anime4KPipeline {
    /**
     *  [0 - 2] conv2d_tf - conv2d_tf2
     *  [3 - 5] conv2d_1_tf - conv2d_1_tf2
     *  [6 - 8] conv2d_2_tf - conv2d_2_tf2
     *  [9 - 11] conv2d_3_tf - conv2d_3_tf2
     *  [12 - 14] conv2d_4_tf - conv2d_4_tf2
     *  [15 - 17] conv2d_5_tf - conv2d_5_tf2
     *  [18 - 20] conv2d_6_tf - conv2d_6_tf2
     *  [21 - 23] conv2d_last_tf - conv2d_last_tf2
     */
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of CNNx2UL.
     *
     * @param {Object} options - The options for the CNNx2UL pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    updateParam(param: string, value: any): void;
    getOutputTexture(): GPUTexture;
    pass(encoder: GPUCommandEncoder): void;
}
