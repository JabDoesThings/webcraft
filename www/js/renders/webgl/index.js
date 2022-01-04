//@ts-check
import BaseRenderer, {BaseCubeGeometry, BaseCubeShader, BaseTexture, CubeMesh} from "../BaseRenderer.js";
import {WebGLMaterial} from "./WebGLMaterial.js";
import {WebGLTerrainShader} from "./WebGLTerrainShader.js";
import {WebGLBuffer} from "./WebGLBuffer.js";
import {Helpers} from "../../helpers.js";
import {Resources} from "../../resources.js";
import {WebGLTexture3D} from "./WebGLTexture3D.js";
import {WebGLRenderTarget} from "./WebGLRenderTarget.js";

const TEXTURE_FILTER_GL = {
    'linear': 'LINEAR',
    'nearest': 'NEAREST'
}

const TEXTURE_MODE = {
    '2d': 'TEXTURE_2D',
    'cube': 'TEXTURE_CUBE_MAP'
}

export class WebGLCubeShader extends BaseCubeShader {

    constructor(context, options) {
        super(context, options);
        //
        const {
            gl
        } = this.context;
        //
        Helpers.createGLProgram(gl, options.code, (ret) => {
            this.program = ret.program;
        });
        //
        this.u_texture =  gl.getUniformLocation(this.program, 'u_texture');
        this.u_lookAtMatrix = gl.getUniformLocation(this.program, 'u_lookAtMatrix');
        this.u_projectionMatrix = gl.getUniformLocation(this.program, 'u_projectionMatrix');
        // this.u_brightness = gl.getUniformLocation(this.program, 'u_brightness');
        this.u_resolution = gl.getUniformLocation(this.program, 'u_resolution');
        this.u_TestLightOn = gl.getUniformLocation(this.program, 'u_TestLightOn');
        this.a_vertex = gl.getAttribLocation(this.program, 'a_vertex');
        // Make custom uniforms
        if(options && 'uniforms' in options) {
            this.makeUniforms(options.uniforms);
        }
    }

    //
    makeUniforms(uniforms) {
        const {
            gl
        } = this.context;
        this.uniforms = {};
        for(let name of Object.keys(uniforms)) {
            let value = uniforms[name];
            let type = null;
            let func = null;
            switch(typeof value) {
                case 'boolean': {
                    type = 'bool';
                    func = 'uniform1f';
                    break;
                }
                case 'object': {
                    type = 'vec3';
                    func = 'uniform3fv';
                    break;
                }
                case 'number': {
                    type = 'float';
                    func = 'uniform1f';
                    break;
                }
                default: {
                    throw 'Unsupported uniform type ' + (typeof value);
                }
            }
            this.uniforms[name] = {
                name: name,
                type: type,
                func: func,
                value: value,
                ptr: gl.getUniformLocation(this.program, name),
                set: (v) => this.value = v,
                get: () => this.value
            };
        }
    }

    applyUniforms() {
        const { gl } = this.context;
        gl.useProgram(this.program);
        // Bind custom uniforms
        for(let name of Object.keys(this.uniforms)) {
            let unf = this.uniforms[name];
            gl[unf.func](unf.ptr, unf.value);
        }
    }

    bind() {

        this.texture.bind(0);
        const { gl } = this.context;

        gl.useProgram(this.program);

        // gl.uniform1f(this.u_brightness, this.brightness);
        gl.uniform2fv(this.u_resolution, this.resolution);
        gl.uniform1f(this.u_TestLightOn, this.testLightOn);

        gl.uniform1i(this.u_texture, 0);

        gl.uniformMatrix4fv(this.u_lookAtMatrix, false, this.lookAt);
        gl.uniformMatrix4fv(this.u_projectionMatrix, false, this.proj);

        this.applyUniforms();

    }

}

export class WebGLCubeGeometry extends BaseCubeGeometry {
    constructor(context, options) {
        super(context, options);

        this.vao = null;
    }

    bind(shader) {
        const { gl } = this.context;

        if (this.vao) {
            this.context.gl.bindVertexArray(this.vao);
            return;
        }

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vertex.bind();
        this.index.bind();

        gl.vertexAttribPointer(shader.a_vertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shader.a_vertex);
    }

    unbind() {
        this.context.gl.bindVertexArray(null);
    }

}

export class WebGLTexture extends BaseTexture {

    _applyStyle() {
        const {
            gl
        } = this.context;

        const type = gl[TEXTURE_MODE[this.mode]] || gl.TEXTURE_2D;

        if (this.minFilter !== this._lastMinFilter) {
            this._lastMinFilter = this.minFilter;
            gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, gl[TEXTURE_FILTER_GL[this.minFilter]] || gl.LINEAR);
        }

        if (this.magFilter !== this._lastMagFilter) {
            this._lastMagFilter = this.magFilter;
            gl.texParameteri(type, gl.TEXTURE_MAG_FILTER, gl[TEXTURE_FILTER_GL[this.magFilter]] || gl.LINEAR);
        }
    }

    bind(location) {
        location = location || 0;
        const {
            gl
        } = this.context;

        gl.activeTexture(gl.TEXTURE0 + location);

        if (this.dirty) {
            return this.upload();
        }

        const {
            texture
        } = this;

        const type = gl[TEXTURE_MODE[this.mode]] || gl.TEXTURE_2D;

        gl.bindTexture(type, texture);

        this._applyStyle();
    }

    upload() {
        const { gl } = this.context;
        /**
         * @type {WebGLTexture}
         */

        const mode = Array.isArray(this.source) ? 'cube' : '2d';
        this.mode = mode;

        const t = this.texture = this.texture || gl.createTexture();
        const type = gl[TEXTURE_MODE[mode]] || gl.TEXTURE_2D;

        gl.bindTexture(type, t);

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        if (mode === '2d') {
            if (this.source) {
                gl.texImage2D(type, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
            } else {
                gl.texImage2D(type, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            }

            this._applyStyle();
            super.upload();
            return;
        }
        for(let i = 0; i < 6; i ++) {
            const start = gl.TEXTURE_CUBE_MAP_POSITIVE_X;
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            if (this.source) {
                gl.texImage2D(start + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source[i]);
            } else {
                gl.texImage2D(start + i, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            }
        }

        gl.generateMipmap(type);
        gl.texParameteri(type, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        super.upload();
    }

    destroy() {
        if (!this.texture) {
            return;
        }

        super.destroy();

        // not destroy shared texture that used 
        if(this.isUsed) {
            return;
        }

        const  { gl } = this.context;
        gl.deleteTexture(this.texture);
        this.texture = null;
        this.source = null;
        this.width = this.height = 0;
    }

}

export default class WebGLRenderer extends BaseRenderer {

    constructor(view, options) {
        super(view, options);
        /**
         *
         * @type {WebGL2RenderingContext}
         */
        this.gl = null;
        this._activeTextures = {};
        this._shader = null;

        // test only
        /**
         * @type {WebGLRenderTarget}
         */
        this._mainFrame = null;

        this.depthState = {
            write: true,
            test: true,
        }
    }

    async init() {
        const gl = this.gl = this.view.getContext('webgl2', this.options);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._emptyTex3D.bind(5)
        return Promise.resolve(this);
    }

    resize(w, h) {
        if (this.size.width === w && this.size.height === h) {
            return;
        }
        super.resize(w, h);
        this.view.width = w;
        this.view.height = h;
        this.resolution = [w, h];
    }

    _configure() {
        super._configure();

        /*
        if (this._mainFrame) {
            this._mainFrame.destroy();
        }

        this._mainFrame = this.createRenderTarget({
            width: this.size.width,
            height: this.size.height,
            depth: true,
        });
        */
    }

    /**
     * 
     * @param {WebGLRenderTarget} target 
     */
    setTarget(target) {
        super.setTarget(target);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target ?  target.framebuffer : null);

        const { gl, fogColor } = this;
        const {
            width, height
        } = target ? target : this.size;

        gl.viewport(0, 0, width, height);
    }

    clear( { depth, color } = {depth: true, color: true}) {
        const gl = this.gl;

        const mask = (depth ? gl.DEPTH_BUFFER_BIT : 0) | (color ? gl.COLOR_BUFFER_BIT : 0);

        if (mask) {
            gl.clear(mask);
        }
    }

    createRenderTarget(options) {
        return new WebGLRenderTarget(this, options);
    }

    createMaterial(options) {
        return new WebGLMaterial(this, options);
    }

    createTexture(options) {
        let texture;

        if (options.shared) {
            // can use exist texture
            texture = this._textures.find(t => t && t.isSimilar && t.isSimilar(options));
        }

        if (!texture) {
            texture = new WebGLTexture(this, options);
        }

        texture.usage ++;

        return texture;
    }

    createTexture3D(options) {
        return new WebGLTexture3D(this, options);
    }

    createShader(options) {
        return new WebGLTerrainShader(this, options);
    }

    async createResourcePackShader(options) {
        let shaderCode = await Resources.loadWebGLShaders(options.vertex, options.fragment);
        return this.createShader(shaderCode);
    }

    createBuffer(options) {
        return new WebGLBuffer(this, options);
    }

    drawMesh(geom, material, a_pos = null, modelMatrix = null, draw_type) {
        if (geom.size === 0) {
            return;
        }
        let gl = this.gl;
        if(!draw_type) {
            draw_type = 'triangles';
        }
        switch(draw_type) {
            case 'triangles': {
                draw_type = gl.TRIANGLES;
                break;
            }
            case 'line_loop': {
                draw_type = gl.LINE_LOOP;
                break;
            }
        }
        material.bind();
        geom.bind(material.shader);
        material.shader.updatePos(a_pos, modelMatrix);
        gl.drawArraysInstanced(draw_type, 0, 6, geom.size);
        // stat
        this.stat.drawquads += geom.size;
        this.stat.drawcalls++;
    }

    beginFrame(fogColor) {
        // debug only
        const { gl } = this;
        this.setTarget(null); // or null to init viewport

        gl.clearColor(fogColor[0], fogColor[1], fogColor[2], fogColor[3]);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    endFrame() {
        // this.blitRenderTarget();
        // reset framebufer
        this.setTarget(null);
    }

    // flisth active buffer onto canvas
    blitRenderTarget({x = 0, y = 0, w = null, h = null} = {}) {
        /**
         * @type {WebGLRenderTarget}
         */
        const target = this._target;
        if (!target) {
            return;
        }

        const gl = this.gl;

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        gl.blitFramebuffer(
            0, 0, target.width, target.height,
            x, y, (w || this.size.width) + x, (h || this.size.height) + y,
            gl.COLOR_BUFFER_BIT, gl.LINEAR
        );
        
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    }

    createCubeMap(options) {
        return new CubeMesh(new WebGLCubeShader(this, options), new WebGLCubeGeometry(this, options));
    }

    drawCube(cube) {
        if (this._mat) {
            this._mat.unbind();
            this._mat = null;
        }
        cube.shader.bind();
        cube.geom.bind(cube.shader);

        const  {
            gl
        } = this;

        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        // stat
        this.stat.drawquads += 6;
        this.stat.drawcalls++;
    }

    /**
     * Read pixels from framebuffer
     * @returns {Uint8Array}
     */
    toRawPixels() {
        const buffer = new Uint8Array(this.view.width * this.view.height * 4);
        this.gl.readPixels(0,0, this.view.width, this.view.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, buffer);
        return buffer;
    }

    async screenshot() {
        const buffer = this.toRawPixels();
        let width = this.view.width;
        let height = this.view.height;
        for (let i = 0; i < buffer.length; i += 4) {
            const a = buffer[i + 3] / 0xff;
            if (!a) {
                continue;
            }
            buffer[i + 0] = Math.round(buffer[i + 0] / a);
            buffer[i + 1] = Math.round(buffer[i + 1] / a);
            buffer[i + 2] = Math.round(buffer[i + 2] / a);
        }
        const data = new ImageData(width, height);
        for(let i = 0; i < height; i ++) {
            const invi = height - i - 1;
            data.data.set(
                buffer.subarray(invi * width * 4, (invi + 1) * width * 4),
                i * width * 4);
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.canvas.width = width;
        ctx.canvas.height = height;
        ctx.putImageData(data, 0, 0);
        ctx.canvas.toBlob(function(blob) {
            ctx.canvas.width = ctx.canvas.height = 0;
            // let filefromblob = new File([blob], 'image.png', {type: 'image/png'});
            Helpers.downloadBlobPNG(blob, 'screenshot.png'); // filefromblob);
        }, 'image/png');
    }

}

/**
 *
 * @param {HTMLCanvasElement} view
 */
WebGLRenderer.test = function(view, options = {}) {
    /**
     * @type {*}
     */
    const context = view.getContext('webgl2', options);
    return !!context;
}

WebGLRenderer.kind = 'webgl';
