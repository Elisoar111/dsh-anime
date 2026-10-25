/// <reference types="@webgpu/types" />
import { Anime4KPipeline, OriginalPipelineDescriptor } from '../../interfaces';
/**
 * Original pipeline
 *    Output the input texture without any change.
*/
export declare class Original implements Anime4KPipeline {
    outputTexture: GPUTexture;
    /**
     * Creates an instance of Original.
     *
     * @param {Object} options - The options for the Original pipeline.
     * @param {GPUTexture} options.inputTexture - The input texture for the pipeline.
     */
    constructor({ inputTexture, }: OriginalPipelineDescriptor);
    updateParam(param: string, value: any): void;
    pass(encoder: GPUCommandEncoder): void;
    getOutputTexture(): GPUTexture;
}
