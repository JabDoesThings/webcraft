import { ServerClient } from "../../../www/js/server_client.js";

export default class packet_reader {

    // must be puto to queue
    static get queue() {
        return false;
    }

    // which command can be parsed with this class
    static get command() {
        return ServerClient.CMD_STATS;
    }

    static async read(player, packet) {

        const death     = player.state.stats.death;
        const time      = player.state.stats.time;
        const pickat    = player.state.stats.pickat;
        const distance  = player.state.stats.distance;

        let packets = [{
            name: ServerClient.CMD_STATS,
            data: {
                "death":                death,
                "time":                 time,
				"time_formatted":       packet_reader.secToStr(time),
                "pickat":               pickat,
                "distance":             distance,
				"distance_formatted":   distance + " м"
            }
        }];

        player.world.sendSelected(packets, [player.session.user_id], []);

        return true;
    
    }

	static secToStr(time) {
        let minute = Math.floor(time / 60);
        let hours = Math.floor(minute / 60);
        let day = Math.floor(hours / 24);
        minute %= 60;
        hours %= 24;
        const resp = [];
        if(day > 0) resp.push(day + ' дней');
        if(hours > 0) resp.push(hours + ' часов');
        resp.push(minute + ' минут');
        return resp.join(' ');
    }

}