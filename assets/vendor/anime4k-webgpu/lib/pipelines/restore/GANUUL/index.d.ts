/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class GANUUL implements Anime4KPipeline {
    /**
     * pipelines:
     *  [0] conv2d_tf
     *  [1] conv2d_tf1
     *  [2] conv2d_1_tf
     *  [3] conv2d_1_tf1
     *  [4] conv2d_1_tf2
     *  [5] conv2d_2_tf
     *  [6] conv2d_2_tf1
     *  [7] conv2d_3_tf
     *  [8] conv2d_3_tf1
     *  [9] conv2d_3_tf2
     *  [10] conv2d_4_tf
     *  [11] conv2d_4_tf1
     *  [12] conv2d_5_tf
     *  [13] conv2d_5_tf1
     *  [14] conv2d_5_tf2
     *  [15] conv2d_6_tf
     *  [16] conv2d_6_tf1
     *  [17] output
     */
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of GANUUL.
     *
     * @param {Object} options - The options for the GANUUL pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    fillOutputTextures(outputTextures: GPUTexture[], from: number, count: number): void;
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
