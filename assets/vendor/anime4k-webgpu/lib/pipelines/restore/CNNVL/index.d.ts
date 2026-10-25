/// <reference types="@webgpu/types" />
import { Anime4KPipeline, Anime4KPipelineDescriptor } from '../../interfaces';
export declare class CNNVL implements Anime4KPipeline {
    /**
     *  [0, 1] conv2d_tf, conv2d_tf1
     *  [2, 3] conv2d_1_tf, conv2d_1_tf1
     *  [4, 5] conv2d_2_tf, conv2d_2_tf1
     *  [6, 7] conv2d_3_tf, conv2d_3_tf1
     *  [8, 9] conv2d_4_tf, conv2d_4_tf1
     *  [10, 11] conv2d_5_tf, conv2d_5_tf1
     *  [12, 13] conv2d_6_tf, conv2d_6_tf1
     *  [14, 15] conv2d_7_tf, conv2d_7_tf1
     *  [14] output
     */
    pipelines: Anime4KPipeline[];
    /**
     * Creates an instance of CNNSoftVL.
     *
     * @param {Object} options - The options for the CNNSoftVL pipeline.
     * @param {GPUDevice} options.device - The GPU device to use for
     * creating textures and shader modules.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ device, inputTexture, }: Anime4KPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
    private pushPipeline;
    private fillOutputTextures;
}
