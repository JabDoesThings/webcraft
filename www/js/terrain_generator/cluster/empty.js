import {ClusterBase} from "./base.js";

//
export class ClusterEmpty extends ClusterBase {

    constructor(addr) {
        super(addr);
        this.max_height  = 1;
        this.is_empty = true;
    }

    // Fill chunk blocks
    fillBlocks(maps, chunk, map) {
        return false;
    }

}