import { ServerClient } from "../../../www/js/server_client.js";

export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return false;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_CONNECT;
    }

    // Player connect to world
    static async read(player, packet) {
        let world_guid = packet.data.world_guid;
        player.session = await Game.db.GetPlayerSession(player.session_id);
        Log.append('CmdConnect', {world_guid, session: player.session});
        player.world.onPlayer(player, player.skin);
        return true;
    }

}