//@ts-check
import BaseRenderer, {BaseCubeGeometry, CubeMesh} from "../BaseRenderer.js";
import {WebGPUTerrainShader} from "./WebGPUTerrainShader.js";
import {WebGPUMaterial} from "./WebGPUMaterial.js";
import {WebGPUTexture} from "./WebGPUTexture.js";
import {WebGPUBuffer} from "./WebGPUBuffer.js";
import {WebGPUCubeShader} from "./WebGPUCubeShader.js";
import {Postprocess} from "./Postprocess.js";

export default class WebGPURenderer extends BaseRenderer{
    constructor(view, options) {
        super(view, options);

        this.useDof = options.dof;
        /**
         *
         * @type {GPUDevice} {null}
         */
        this.device = null;
        /**
         *
         * @type {GPUAdapter}
         */
        this.adapter = null;
        /**
         *
         * @type {GPUCanvasContext}
         */
        this.context = null;

        this.format = '';

        /**
         *
         * @type {GPUCommandEncoder}
         */
        this.encoder = null;

        /**
         *
         * @type {GPURenderPassEncoder}
         */
        this.passEncoder = null;

        /**
         *
         * @type {GPUTexture}
         */
        this.depth = null;
        /**
         *
         * @type {GPUTexture}
         */
        this.main = null;

        this.subMats = [];

        /**
         * @type {Postprocess}
         */
        this.postProcess = null;
    }

    get currentBackTexture() {
        return this.postProcess ? this.main.createView() : this.context.getCurrentTexture().createView();
    }

    createShader(options = {}) {
        return new WebGPUTerrainShader(this, options);
    }

    createMaterial(options = {}) {
        return new WebGPUMaterial(this, options);
    }

    createTexture(options = {}) {
        return new WebGPUTexture(this, options);
    }

    createBuffer(options) {
        return new WebGPUBuffer(this, options);
    }

    createCubeMap(options) {
        return new CubeMesh(new WebGPUCubeShader(this, options), new BaseCubeGeometry(this, options));
    }

    beginFrame(fogColor = [0,0,0,0]) {
        super.beginFrame(fogColor);

        this.encoder = this.device.createCommandEncoder();
        this.passEncoder = this.encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.currentBackTexture,
                    loadValue: fogColor,
                    storeOp: 'store',
                }
            ],
            depthStencilAttachment: {
                view: this.depth.createView(),

                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        });
    }

    /**
     *
     * @param geom
     * @param {WebGPUMaterial} material
     */
    drawMesh(geom, material, a_pos = null, modelMatrix = null) {
        if (geom.size === 0) {
            return;
        }

        geom.bind(material.shader);

        if (a_pos) {
            material = material.getSubMat();
            this.subMats.push(material);
        }


        material.updatePos(a_pos, modelMatrix);
        material.bind(this);

        this.passEncoder.setPipeline(material.pipeline);

        geom.buffers.forEach((e, i) => {
            e.bind();
            if (e.index) {
                this.passEncoder.setIndexBuffer(e.buffer, 'uint16');
                return;
            }

            this.passEncoder.setVertexBuffer(i, e.buffer);
        })


        this.passEncoder.setBindGroup(0, material.group);

        if(material.skinGroup)
            this.passEncoder.setBindGroup(1, material.skinGroup);

        this.passEncoder.draw(6, geom.size, 0, 0);
    }

    drawCube(cube) {
        cube.shader.update();
        this.passEncoder.setPipeline(cube.shader.pipeline);
        this.passEncoder.setBindGroup(0, cube.shader.group);

        cube.geom.vertex.bind();
        this.passEncoder.setVertexBuffer(0, cube.geom.vertex.buffer);

        cube.geom.index.bind();
        this.passEncoder.setIndexBuffer(cube.geom.index.buffer, 'uint16');
        this.passEncoder.drawIndexed(36);
    }

    endFrame() {
        this.passEncoder.endPass();

        if (this.postProcess) {
            this.postProcess.run(this.encoder, this.context.getCurrentTexture().createView());
            //this.postProcess.blit(this.encoder, this.context.getCurrentTexture().createView());
        }

        this.device.queue.submit([this.encoder.finish()]);

        this.subMats.forEach(e => e.destroy());
        this.subMats.length = 0;
    }

    async init({dof = false} = {}) {
        this.adapter = await navigator.gpu.requestAdapter();
        this.device = await this.adapter.requestDevice();
        this.context = this.view.getContext('webgpu');
        this.format = this.context.getPreferredFormat(this.adapter);

        this.useDof = dof;
        if(dof)
            this.postProcess = new Postprocess(this, {});
    }

    resize(w, h) {
        if (this.size.width === w && this.size.height === h) {
            return;
        }

        super.resize(w, h);

        this.view.width = w;
        this.view.height = h;

    }

    _configure() {
        if (this.size.width * this.size.height < 1)
            return;

        super._configure();

        this.context.configure({
            size: this.size,
            format: this.format,
            device: this.device
        });

        if (this.depth)
            this.depth.destroy();

        this.depth = this.device.createTexture({
            size: this.size,
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.main = this.device.createTexture({
            size: this.size,
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        if(this.postProcess)
            this.postProcess.resize(this.size.width, this.size.height);
    }
}

/**
 *
 * @param {HTMLCanvasElement} view
 */
WebGPURenderer.test = function(view, options = {}) {
    const context = navigator.gpu && view.getContext('webgpu');
    return !!context;
}

WebGPURenderer.kind = 'webgpu';