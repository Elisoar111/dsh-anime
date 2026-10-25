/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class GANx3L implements Anime4KPipeline {
    /**
     * pipelines:
     *  [0] conv2d_tf
     *  [1] conv2d_tf1
     *  [2] conv2d_tf2
     *  [3] conv2d_2_tf
     *  [4] conv2d_1_tf
     *  [5] conv2d_3_tf
     *  [6] conv2d_3_tf1
     *  [7] conv2d_3_tf2
     *  [8] conv2d_5_tf
     *  [9] conv2d_4_tf
     *  [10] conv2d_6_tf
     *  [11] conv2d_6_tf1
     *  [12] conv2d_6_tf2
     *  [13] conv2d_8_tf
     *  [14] conv2d_7_tf
     *  [15] conv2d_9_tf
     *  [16] conv2d_9_tf1
     *  [17] conv2d_9_tf2
     *  [18] conv2d_11_tf
     *  [19] conv2d_10_tf
     *  [20] conv2d_12_tf
     *  [21] conv2d_12_tf1
     *  [22] conv2d_12_tf2
     *  [23] conv2d_13_tf
     *  [24] conv0ups
     *  [25] conv0ups1
     *  [26] conv0ups2
     *  [27] conv1ups
     *  [28] conv1ups1
     *  [29] output
     */
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of GANx3L.
     *
     * @param {Object} options - The options for the GANx3L pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    private fillOutputTextures;
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
