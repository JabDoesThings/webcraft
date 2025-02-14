import { ServerClient } from "../../www/js/server_client.js";
import fs from 'fs';
import path from "path";

class PacketRequerQueue {

    constructor(packet_reader) {
        this.packet_reader = packet_reader;
        this.list = [];
    }

    add(reader, player, packet) {
        this.list.push({reader, player, packet});
    }

    async process() {
        let len = this.list.length;
        for(let i = 0; i < len; i++) {
            const item = this.list.shift();
            try {
                const {reader, player, packet} = item;
                const resp = await reader.read(player, packet);
                if(!resp) {
                    this.list.push(item);
                }
            } catch(e) {
                await this.packet_reader.sendErrorToPlayer(player, e);
            }
        }
    }

}

let fsfdg = 0;

//
export class PacketReader {

    constructor() {

        // packet queue
        this.queue = new PacketRequerQueue(this);

        // Load all packet readers from directory
        this.registered_readers = new Map();
        const packets_dir = path.join(__dirname, '/network/clientpackets');
        fs.readdir(packets_dir, (err, files) => {
            files.forEach(file => {
                const file_path = path.join(packets_dir, file).replace(path.join(__dirname, '/network'), '.').replace('\\', '/');
                import(file_path).then(module => {
                    this.registered_readers.set(module.default.command, module.default);
                    console.info(`Registered client packet reader: ${module.default.command}`)
                });
            });
        });

    }

    // Read packet
    async read(player, packet) {

        if (player.is_dead && [ServerClient.CMD_RESURRECTION, ServerClient.CMD_CHUNK_LOAD].indexOf(packet.name) < 0) {
            return;
        }

        try {
            const reader = this.registered_readers.get(packet?.name);
            if(reader) {
                if(reader.queue) {
                    this.queue.add(reader, player, packet);
                } else {
                    await reader.read(player, packet);
                }
            } else {
                console.log(`ERROR: Not found packet reader for command: ${packet.name}`);
            }
        } catch(e) {
            await this.sendErrorToPlayer(player, e);
        }

    }

    //
    async sendErrorToPlayer(player, e) {
        console.log(e);
        const packets = [{
            name: ServerClient.CMD_ERROR,
            data: {
                message: e
            }
        }];
        player.world.sendSelected(packets, [player.session.user_id], []);
    }

}