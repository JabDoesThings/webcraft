import {BaseTerrainShader} from "../BaseRenderer";
import {Helpers} from "../../helpers";

class WebGLTerrainShader extends BaseTerrainShader {
    constructor(context, options) {
        super(context, options);

        const {gl} = context;

        Helpers.createGLProgram(gl, options.code, (ret) => {
            this.program = ret.program;
        });

        const program = this.program;

        this.uProjMat           = gl.getUniformLocation(program, 'uProjMatrix');
        this.uModelMatrix       = gl.getUniformLocation(program, 'u_worldView');
        this.uModelMat          = gl.getUniformLocation(program, 'uModelMatrix');

        this.u_add_pos          = gl.getUniformLocation(program, 'u_add_pos');
        this.u_fogColor         = gl.getUniformLocation(program, 'u_fogColor');
        this.u_fogDensity       = gl.getUniformLocation(program, 'u_fogDensity');
        this.u_fogAddColor      = gl.getUniformLocation(program, 'u_fogAddColor');
        this.u_fogOn            = gl.getUniformLocation(program, 'u_fogOn');
        this.u_blockSize        = gl.getUniformLocation(program, 'u_blockSize');
        this.u_pixelSize        = gl.getUniformLocation(program, 'u_pixelSize');
        this.u_mipmap           = gl.getUniformLocation(program, 'u_mipmap');
        this.u_chunkBlockDist   = gl.getUniformLocation(program, 'u_chunkBlockDist');
        this.u_brightness       = gl.getUniformLocation(program, 'u_brightness');

        this.a_position         = gl.getAttribLocation(program, 'a_position');
        this.a_axisX            = gl.getAttribLocation(program, 'a_axisX');
        this.a_axisY            = gl.getAttribLocation(program, 'a_axisY');
        this.a_uvCenter         = gl.getAttribLocation(program, 'a_uvCenter');
        this.a_uvSize           = gl.getAttribLocation(program, 'a_uvSize');
        this.a_color            = gl.getAttribLocation(program, 'a_color');
        this.a_occlusion        = gl.getAttribLocation(program, 'a_occlusion');
        this.a_flags            = gl.getAttribLocation(program, 'a_flags');
        this.a_quad             = gl.getAttribLocation(program, 'a_quad');
        this.a_quadOcc          = gl.getAttribLocation(program, 'a_quadOcc');

        // depends on material
        this.u_texture          = gl.getUniformLocation(program, 'u_texture');
        this.u_opaqueThreshold  = gl.getUniformLocation(program, 'u_opaqueThreshold');
    }

    bind() {
        const {gl} = this.context;
        gl.useProgram(this.program);
    }

    update() {
        const { gl } = this.context;
        gl.uniformMatrix4fv(this.uModelMatrix, false, this.viewMatrix);
        gl.uniformMatrix4fv(this.uProjMat, false, this.projMatrix);
        gl.uniform1f(this.u_fogDensity, this.fogDensity);
        gl.uniform4fv(this.u_fogAddColor, this.fogAddColor);
        gl.uniform1f(this.u_mipmap, this.mipmap);
        gl.uniform1f(this.u_brightness, this.brightness);

        gl.uniform1i(this.u_fogOn, true);
    }
}
