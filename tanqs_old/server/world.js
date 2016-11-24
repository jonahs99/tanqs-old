
var shared = require('../public/shared/shared.js');
var Vec2 = shared.Vec2;
var clamp = shared.clamp;

var Flags = new require('./flags.js');

var Physics = require('./physics.js');

// World class with all the nitty gritty server simulation code

function World() {

	this.server = null;

	this.tanks = [];
	this.bullets = [];
	this.flags = [];
	this.map = {};

	this.teams = [];

	this.n_tanks = 24;
	this.n_bullets = 72;
	this.n_flags = 30;

	//this.generate_map();
	this.reset();

	this.flag_types = new Flags(this);

};

World.prototype.reset = function() {

	this.tanks = [];
	this.bullets = [];
	this.flags = [];

	// populate the tank array with dead tanks
	for (var i = 0; i < this.n_tanks; i++) {
		this.tanks.push(new Tank());
		this.tanks[i].id = i;
	}
	for (var i = 0; i < this.n_bullets; i++) {
		this.bullets.push(new Bullet());
	}
	for (var i = 0; i < this.n_flags; i++) {
		this.flags.push(new Flag());
	}

};

World.prototype.parse_map = function(map) {

	this.map = {size: map.size, rectangles: [], polys: []};

	for (var i = 0; i < map.teams.length; i++) {

		var team_data = map.teams[i];

		var flag = this.flags[i];
		flag.alive = true;
		flag.type = "team";
		flag.spawn.set_xy(team_data.flag.x, team_data.flag.y);
		flag.pos.set(flag.spawn);
		flag.team = i;
		flag.rad = 14;

		var pad = {x: team_data.pad.x, y: team_data.pad.y, hwidth: team_data.pad.hwidth, hheight: team_data.pad.hheight, team: i};
		this.map.rectangles.push(pad);

		this.teams[i] = {
			spawn: new Vec2(team_data.spawn.x, team_data.spawn.y),
			tanks: [],
			name: (["red", "blue"])[i],
			score: 0
		};

	}

	for (var i = 0; i < map.flags.length; i++) {

		var flag_data = map.flags[i];
		var flag = this.flags[i + map.teams.length];

		flag.alive = true;
		flag.type = flag_data.type;
		flag.spawn.set_xy(flag_data.x, flag_data.y);
		flag.pos.set(flag.spawn);
		flag.team = -1;

	}

	if (!map.polys) map.polys = [];

	for (var i = 0; i < map.rectangles.length; i++) {

		var rect_data = map.rectangles[i];
		/*var rect = {x: rect_data.x, y: rect_data.y, hwidth: rect_data.hwidth, hheight: rect_data.hheight, team: -1};
		this.map.rectangles.push(rect);*/

		map.polys.push({v: [
			{x:(rect_data.x - rect_data.hwidth), y:(rect_data.y - rect_data.hheight)},
			{x:(rect_data.x - rect_data.hwidth), y:(rect_data.y + rect_data.hheight)},
			{x:(rect_data.x + rect_data.hwidth), y:(rect_data.y + rect_data.hheight)},
			{x:(rect_data.x + rect_data.hwidth), y:(rect_data.y - rect_data.hheight)}
			]});

	}

	for (var i = 0; i < map.polys.length; i++) {

		var poly_data = map.polys[i];
		var poly = {v:[], l:[], n:[]};

		var x1, x2, y1, y2;

		for (var j = 0; j < poly_data.v.length; j++) {
			var v = poly_data.v[j];
			poly.v[j] = new Vec2(v.x, v.y);
			if (v.x < x1 || j == 0) x1 = v.x;
			if (v.x > x2 || j == 0) x2 = v.x;
			if (v.y < y1 || j == 0) y1 = v.y;
			if (v.y > y2 || j == 0) y2 = v.y;
		}

		// Bounding box calculation
		poly.pos = new Vec2((x1 + x2) / 2, (y1 + y2) / 2)
		poly.hwidth = Math.abs(x2 - x1);
		poly.hheight = Math.abs(y2 - y1);

		for (var j = 0; j < poly_data.v.length; j++) {
			var k = (j + 1) % poly_data.v.length;
			poly.l[j] = (new Vec2()).set(poly.v[k]).m_sub(poly.v[j]).m_unit();
			poly.n[j] = poly.l[j].norm().m_unit();
		}

		this.map.polys.push(poly);

	}

};

World.prototype.generate_map = function() {

	var n_squares = 36;
	var min_rad = 40; var max_rad = 80;

	var sqrt = Math.floor(Math.sqrt(n_squares));
	var x_spacing = this.map.size.width / sqrt;
	var y_spacing = this.map.size.height / sqrt;

	for (var x = -sqrt / 2; x < sqrt / 2; x++) {
		for (var y = -sqrt / 2; y < sqrt / 2; y++) {
			var rad = Math.random() * (max_rad - min_rad) + min_rad;
			var sx = Math.random() * (x_spacing - rad * 2) + x * x_spacing + rad;
			var sy = Math.random() * (y_spacing - rad * 2) + y * y_spacing + rad;
			var square = {x: sx, y: sy, rad: rad};
			this.map.squares.push(square);
		}
	}

};

function random_color() {

	var colors = [	'#ffb366',
					'#ff6766',
					'#ff66b2',
					'#66ffff',
					'#6766ff',
					'#66b2ff',
					'#66ffb3',
					'#9058c6',
					'#58c690'
				];
	return colors[Math.floor(Math.random() * colors.length)];
}

var team_colors = [
	['#ff668c','#ff6680','#ff6673','#ff6666','#ff7366','#ff8066','#ff8c66'],
	['#66e1ff', '#66d5ff', '#66c8ff', '#66bbff', '#66aeff', '#66a2ff', '#6695ff']
];
function random_team_color(team_id) {
	var colors = team_colors[team_id];
	return colors[Math.floor(Math.random() * colors.length)];
};

World.prototype.reserve_tank = function(client) { // Returns the id of the reserved tank, or -1 if unsuccessful
	for (var i = 0; i < this.n_tanks; i++) {
		var tank = this.tanks[i];
		if (!tank.reserved) {
			tank.reserved = true;
			tank.alive = false;
			tank.client = client;

			if (this.teams[0].tanks.length < this.teams[1].tanks.length) {
				this.assign_tank_team(i, 0);
			} else if (this.teams[1].tanks.length < this.teams[0].tanks.length) {
				this.assign_tank_team(i, 1);
			} else {
				if (this.teams[0].score < this.teams[1].score) {
					this.assign_tank_team(i, 0);
				} else if (this.teams[1].score < this.teams[0].score) {
					this.assign_tank_team(i, 1);
				} else {
					this.assign_tank_team(i, Math.floor(Math.random() * 2));
				}
			}

			return i;
		}
	}
	return -1;
};

World.prototype.free_tank = function(id) {
	var tank = this.tanks[id];
	tank.reserved = false;
	tank.alive = false;
	tank.spawn_cooldown = 0;
	if (this.teams[tank.team]) {
		var index = this.teams[tank.team].tanks.indexOf(id);
		if (index > -1) {
			this.teams[tank.team].tanks.splice(index, 1);
		}
	}
};

World.prototype.assign_tank_team = function(id, team) {
	var tank = this.tanks[id];
	tank.team = team;

	var tries = 12;
	var repeat_color = true;
	while (repeat_color && tries > 0) {
		repeat_color = false;
		tank.color = random_team_color(team);
		tries--;
		for (var j = 0; j < this.n_tanks; j++) {
			if (j != id && tank.color == this.tanks[j].color) {
				repeat_color = true;
				break;
			}
		}
	}

	this.teams[team].tanks.push(id);
};

World.prototype.spawn_tank = function(id) {
	var tank = this.tanks[id];

	if (tank.spawn_cooldown > 0) return;

	tank.alive = true;

	tank.set_flag(this.flag_types.default);
	tank.flag_id = -1;

	for (var i = 0; i < tank.max_bullets; i++) {
		tank.reload[i] = tank.reload_ticks;
	}

	if (this.teams[tank.team]) {
		tank.pos.set(this.teams[tank.team].spawn);
		tank.pos.x += Math.random() * 600 - 300;
		tank.pos.y += Math.random() * 600 - 300;
	} else {
		tank.pos.set_xy(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000);
	}

	tank.dir = Math.atan2(-tank.pos.y, -tank.pos.x) || 0;

	tank.steer_target.set_xy(0, 0);
};

World.prototype.kill_tank = function(tank_id) {
	var tank = this.tanks[tank_id];
	tank.alive = false;
	tank.spawn_cooldown = 150;
	this.drop_flag(tank_id);
};

World.prototype.kill_bullet = function(bullet_id) {
	var bullet = this.bullets[bullet_id];
	bullet.alive = false;
};

World.prototype.shoot = function(tank_id) {

	var tank = this.tanks[tank_id];
	if (tank.alive) {
		tank.flag.shoot(tank);
	}
	return -1;
};

World.prototype.drop_flag = function(tank_id) {

	var tank = this.tanks[tank_id];
	if (tank.flag_id > -1) {
		this.server.player_flag_drop(tank_id);
		tank.set_flag(this.flag_types.default);
		var flag = this.flags[tank.flag_id];
		flag.pos.set(tank.pos);
		flag.alive = true;
		flag.cooldown = 50;
		tank.flag_id = -1;
		tank.flag_team = -1;
	}

};

World.prototype.flag_capture = function(tank_id, team_id) {

	var tank = this.tanks[tank_id];

	tank.set_flag(this.flag_types.default);

	var flag = this.flags[tank.flag_id];
	flag.alive = true;
	flag.pos.set(flag.spawn);
	tank.flag_id = -1;
	tank.flag_team = -1;

	var team = this.teams[team_id];
	for (var i = 0; i < team.tanks.length; i++) {
		var enemy_tank = this.tanks[team.tanks[i]];
		if (enemy_tank.alive) {
			this.kill_tank(team.tanks[i]);
			this.server.player_kill(tank_id, team.tanks[i]);
		}
	}

	var team = this.teams[tank.team];
	if (team) {
		team.score++;
	}

	this.server.flag_capture(tank_id, team_id);

};

World.prototype.add_bullet = function(tank_id) {
	var tank = this.tanks[tank_id];
	for (var i = 0; i < this.n_bullets; i++) {
		var bullet = this.bullets[i];
		if (!bullet.alive) {
			bullet.alive = true;
			bullet.new = true;
			bullet.tank = tank_id;
			bullet.team = tank.team;
			return i;
		}
	}
	return -1;
};

World.prototype.update = function() {
	this.update_tanks();
	this.update_bullets();
	this.update_flags();
	this.handle_collisions();
	for (var i = 0; i < this.tanks.length; i++) {
		var tank = this.tanks[i];
		if (tank.alive) {
			tank.vel.set(tank.pos).m_sub(tank.last_pos);
		}
	}
};

World.prototype.update_tanks = function() {
	for (var i = 0; i < this.tanks.length; i++) {
		var tank = this.tanks[i];
		if (tank.alive) {
			tank.steer();
			tank.drive();
			tank.pos.m_clampxy(-this.map.size.width / 2 + tank.rad, this.map.size.width / 2 - tank.rad,
			 -this.map.size.height / 2 + tank.rad, this.map.size.height / 2 - tank.rad);

			for (var j = 0; j < tank.max_bullets; j++) {
				if (tank.reload[j] < tank.reload_ticks) {
					tank.reload[j]++;
				}
			}
		} else {
			if (tank.spawn_cooldown > 0) {
				tank.spawn_cooldown--;
			}
		}
	}
};

World.prototype.update_bullets = function() {
	for (var i = 0; i < this.bullets.length; i++) {
		var bullet = this.bullets[i];
		if (bullet.alive) {

			if (bullet.guided) {

				var d = new Vec2();

				var closest = null;
				var dist = 0;

				for (var j = 0; j < this.tanks.length; j++) {
					var tank = this.tanks[j];
					if (tank.alive && bullet.tank != j && (bullet.team == -1 || tank.team != bullet.team)) {
						d.set(tank.pos).m_sub(bullet.pos);
						var dot = d.dot(bullet.vel);
						var cos = dot / bullet.vel.mag() / d.mag();
						if (cos >= bullet.guided.min_cos) {
							var mag = d.mag();
							if (closest == null || mag < dist) {
								closest = tank;
								dist = mag;
							}
						}

					}
				}

				if (closest) {
					d.set(closest.pos).m_sub(bullet.pos);
					bullet.vel.m_add(d.proj_on(bullet.vel.norm()).m_clamp(0, bullet.guided.max_acc));
				}

			}

			bullet.drive();
			bullet.rad += bullet.expansion;
			if (bullet.expansion > 0) {
				bullet.expansion -= 0.45;
			} else {
				bullet.expansion = 0;
			}
			if (bullet.life <= 0 || !bullet.pos.in_BB(-this.map.size.width / 2, -this.map.size.height / 2, this.map.size.width / 2, this.map.size.height / 2)) {
				this.kill_bullet(i);
			} else {
				bullet.life--;
			}
		}
	}
};

World.prototype.update_flags = function() {

	for (var i = 0; i < this.flags.length; i++) {
		var flag = this.flags[i];
		if (flag.alive) {
			flag.update();
		}
	}
};

World.prototype.handle_collisions = function() {

	// Tank-bullet

	for (var tank_id = 0; tank_id < this.tanks.length; tank_id++) {
		var tank = this.tanks[tank_id];
		if (tank.alive) {
			for (var bullet_id = 0; bullet_id < this.bullets.length; bullet_id++) {
				var bullet = this.bullets[bullet_id];
				if (bullet.alive && bullet.tank != tank_id && (bullet.team == -1 || bullet.team != tank.team)) {
					var dist2 = (new Vec2()).set(tank.pos).m_sub(bullet.pos).mag2();
					var rad2 = Math.pow((tank.rad*1.25) + bullet.rad, 2);
					if (dist2 < rad2) {
						this.server.player_kill(bullet.tank, tank_id)
						this.kill_tank(tank_id);
						if (!bullet.pass_thru) {
							this.kill_bullet(bullet_id);
						}
					}
					if (tank.flag.tank_attr.shield_rad && !bullet.pass_thru) {
						if (tank.reload[tank.flag.weapon_attr.max_bullets - 1] >= tank.flag.weapon_attr.reload_ticks) {
							var srad2 = Math.pow(tank.flag.tank_attr.shield_rad + bullet.rad, 2);
							if (dist2 < srad2) {
								this.kill_bullet(bullet_id);
								tank.reload[tank.flag.weapon_attr.max_bullets - 1] = 0;
							}
						}
					}
				}
			}
		}
	}

	// Tank-wall

	for (var tank_id = 0; tank_id < this.tanks.length; tank_id++) {
		var tank = this.tanks[tank_id];
		if (tank.alive && tank.flag.tank_attr.wall_collide) {
			for (var rect_id = 0; rect_id < this.map.rectangles.length; rect_id++) {
				var rect = this.map.rectangles[rect_id];
				var tot_width = tank.rad + rect.hwidth;
				var tot_height = tank.rad + rect.hheight;
				var x_overlap = tot_width - Math.abs(rect.x - tank.pos.x);
				var y_overlap = tot_height - Math.abs(rect.y - tank.pos.y);
				if (x_overlap > 0 && y_overlap > 0) { // Collision
					if (rect.team == -1) {
						if (x_overlap < y_overlap) { // fix x
							if (tank.pos.x > rect.x) {
								tank.pos.x += x_overlap;
							} else {
								tank.pos.x -= x_overlap;
							}
						} else { // fix y
							if (tank.pos.y > rect.y) {
								tank.pos.y += y_overlap;
							} else {
								tank.pos.y -= y_overlap;
							}
						}
					} else {
						// Tank-pad collision
						if (tank.flag_team > -1 && tank.flag_team != tank.team && tank.team == rect.team) {
							this.flag_capture(tank_id, tank.flag_team);
						}
					}
				}
			}
		}
	}

	for (var tank_id = 0; tank_id < this.tanks.length; tank_id++) {
		var tank = this.tanks[tank_id];
		if (!tank.alive || !tank.flag.tank_attr.wall_collide) continue;

		for (var poly_id = 0; poly_id < this.map.polys.length; poly_id++) {
			var poly = this.map.polys[poly_id];
			var collide = Physics.circle_poly_collide(tank, poly);
			if (collide) {
				tank.pos.x += collide.n.x * collide.overlap;
				tank.pos.y += collide.n.y * collide.overlap;
			}
		}

	}

	// Bullet-wall

	for (var bullet_id = 0; bullet_id < this.bullets.length; bullet_id++) {
		var bullet = this.bullets[bullet_id];
		if (bullet.alive && bullet.wall_collide) {
			for (var rect_id = 0; rect_id < this.map.rectangles.length; rect_id++) {
				var rect = this.map.rectangles[rect_id];
				if (rect.team != -1) continue;
				var tot_width = bullet.rad + rect.hwidth;
				var tot_height = bullet.rad + rect.hheight;
				var x_overlap = tot_width - Math.abs(rect.x - bullet.pos.x);
				var y_overlap = tot_height - Math.abs(rect.y - bullet.pos.y);
				if (x_overlap > 0 && y_overlap > 0) {
					if (bullet.ricochet > 0) {
						if (x_overlap < y_overlap) { // bounce x
							if (Math.abs(bullet.vel.x) >= x_overlap) {
								bullet.vel.x = - bullet.vel.x;
							} else {
								this.kill_bullet(bullet_id);
							}
						} else { // bounce y
							if (Math.abs(bullet.vel.y) >= y_overlap) {
								bullet.vel.y = - bullet.vel.y;
							} else {
								this.kill_bullet(bullet_id);
							}
						}
						bullet.ricochet--;
					} else {
						this.kill_bullet(bullet_id);
					}
					break;
				}
			}
		}
	}

	for (var bullet_id = 0; bullet_id < this.bullets.length; bullet_id++) {
		var bullet = this.bullets[bullet_id];
		if (!bullet.alive || !bullet.wall_collide) continue;

		for (var poly_id = 0; poly_id < this.map.polys.length; poly_id++) {
			var poly = this.map.polys[poly_id];
			var collide = Physics.circle_poly_collide(bullet, poly, bullet.vel);
			if (collide) {
				if (bullet.ricochet > 0) {
					bullet.vel.m_sub(collide.n.scale(2*bullet.vel.dot(collide.n)));
					bullet.ricochet--;
				} else {
					this.kill_bullet(bullet_id);
				}
				break;
			}
		}

	}

	// Tank-tank

	for (var i = 0; i < this.tanks.length; i++) {
		var tank1 = this.tanks[i];
		if (tank1.alive && !(tank1.flag.tank_attr.die_on_collide)) {
			for (var j = 0; j < this.tanks.length; j++) {
				if (i != j) {
					var tank2 = this.tanks[j];
					if ((tank1.team != tank2.team || tank1.team < 0) && tank2.alive && (tank1.flag.tank_attr.kill_on_collide || tank2.flag.tank_attr.die_on_collide)) {
						var dist2 = (new Vec2()).set(tank1.pos).m_sub(tank2.pos).mag2();
						var rad2 = Math.pow((tank1.rad*1.25) + (tank2.rad*1.25), 2);
						if (dist2 < rad2) {
							if (tank2.flag.tank_attr.kill_on_collide) { // Both steam roller lol!
								this.server.player_kill(i, j);
								this.server.player_kill(j, i);
								this.kill_tank(i);
								this.kill_tank(j);
							} else { // Get steam rolled son
								this.server.player_kill(i, j);
								this.kill_tank(j);
							}
						}
					}
				}
			}
		}
	}

	// Tank-flag

	for (var tank_id = 0; tank_id < this.tanks.length; tank_id++) {
		var tank = this.tanks[tank_id];
		if (tank.alive && tank.flag_id < 0) {
			for (var flag_id = 0; flag_id < this.flags.length; flag_id++) {
				var flag = this.flags[flag_id];
				if (flag.alive && flag.cooldown <= 0) {
					var dist2 = (new Vec2()).set(tank.pos).m_sub(flag.pos).mag2();
					var rad2 = Math.pow((tank.rad*1.25) + flag.rad, 2);
					if (dist2 < rad2) {
						flag.alive = false;
						tank.flag_id = flag_id;
						var flag_type = this.flag_types[flag.type];
						if (flag_type) {
							tank.set_flag(flag_type);
						}
						tank.flag_team = flag.team;
						this.server.player_flag_pickup(tank_id);
						break;
					}
				}
			}
		}
	}

};

module.exports = World;

// Tank class

function Tank() {

	this.reserved = false; // We reuse tanks once the player disconnect
	this.alive = false;
	this.client = null;

	this.spawn_cooldown = 0;

	// State

	this.last_pos = new Vec2();
	this.pos = new Vec2();
	this.dir = 0;
	this.vel = new Vec2(); 	//	Stored so that bullet velocities
	this.rot_vel = 0;		//	can be calculated.

	this.steer_target = new Vec2(); // A vector pointing from the tank to the players mouse

	this.left_wheel = 0; // Velocity of each wheel
	this.right_wheel = 0;

	this.reload = [];

	this.killed_by = -1;

	// Configuration

	this.id = -1;
	this.color = '';

	this.max_bullets = 0;
	this.reload_ticks = 0;

	this.rad = 0; // Half the distance between wheels, determines max spin-speed vs max linear-speed
	this.max_velocity = 0; // Max velocity of each wheel
	this.max_wheel_acceleration = 0; // Higher is more responsive

	this.flag = null;
	this.flag_id = -1;
	this.flag_team = -1;

	this.team = -1;

}

Tank.prototype.steer = function() { // Adjusts wheel velocities based on steer_target

	if (this.steer_target.mag2() == 0) { // let's not get crazy divide by 0 errors
		return;
	}

	var dir_vec = (new Vec2()).set_rt(1, this.dir);

	var dot = dir_vec.dot(this.steer_target.unit());
	var clockwise = dir_vec.set_rt(1, this.dir + Math.PI / 2).dot(this.steer_target) > 0;
	var backwards = dot < 0;

	if (backwards) {
		dot = -dot;
	}

	var wheel_dif = (1 - dot) * 2;
	if (dot < 0.999) {
		wheel_dif += 0.2;
	}

	var desired_left_wheel = this.max_velocity;
	var desired_right_wheel = this.max_velocity;

	if (clockwise) {
		desired_right_wheel *= 1 - wheel_dif;
	} else {
		desired_left_wheel *= 1 - wheel_dif;
	}

	if (backwards) {
		desired_left_wheel = -desired_left_wheel;
		desired_right_wheel = -desired_right_wheel;
	}

	var speed_factor = clamp(this.steer_target.mag() / 200, 0, 1);
	desired_left_wheel *= speed_factor;
	desired_right_wheel *= speed_factor;

	// Calculate wheel accelerations to be proportional to difference in desired/actual velocities
	var left_acc = clamp((desired_left_wheel - this.left_wheel) / this.max_velocity, -1, 1) * this.max_wheel_acceleration;
	var right_acc = clamp((desired_right_wheel - this.right_wheel) / this.max_velocity, -1, 1) * this.max_wheel_acceleration;

	this.left_wheel += left_acc;
	this.right_wheel += right_acc;

};

Tank.prototype.drive = function() { // Moves and rotates the tank according to wheel velocities

	this.last_pos.set(this.pos);

	this.rot_vel = (this.left_wheel - this.right_wheel) / 2 / this.rad;
	this.vel.set_rt((this.left_wheel + this.right_wheel) / 2, this.dir);

	this.dir += this.rot_vel;
	this.pos.m_add(this.vel);

};

Tank.prototype.use_reload = function(start, end) {
	start = start || 0;
	end = end || this.max_bullets;
	for (var i = start; i < end; i++) {
		if (this.reload[i] >= this.reload_ticks) {
			this.reload[i] = 0;
			return true;
		}
	}
	return false;
};

Tank.prototype.set_flag = function(flag) {

	this.rad = flag.tank_attr.rad;
	this.max_velocity = flag.tank_attr.max_vel;
	this.max_wheel_acceleration = flag.tank_attr.max_acc;

	var tot_reload = 0;
	for (var i = 0; i < this.max_bullets; i++) {
		tot_reload += this.reload[i];
	}
	tot_reload /= this.max_bullets;

	this.max_bullets = flag.weapon_attr.max_bullets;
	this.reload_ticks = flag.weapon_attr.reload_ticks;

	tot_reload *= this.max_bullets;
	this.reload = [];
	for (var i = 0; i < this.max_bullets; i++) {
		if (tot_reload >= this.reload_ticks) {
			this.reload[i] = this.reload_ticks;
			tot_reload -= this.reload_ticks;
		} else if (tot_reload >= 0){
			this.reload[i] = Math.floor(tot_reload);
			tot_reload = 0;
		} else {
			this.reload[i] = 0;
		}
	}

	this.flag = flag;

};

function Bullet() {

	this.alive = false;
	this.new = false;

	this.tank = -1;
	this.team = -1;

	this.pos = new Vec2();
	this.vel = new Vec2();

	this.rad = 5;
	this.speed = 8;

	this.life = 0; // frames remaining until dead

	this.wall_collide = true;

}

Bullet.prototype.drive = function() {
	this.pos.m_add(this.vel);
};

function Flag() {

	this.alive = false;
	this.cooldown = 0;

	this.team = -1;
	this.type = '';

	this.spawn = new Vec2();
	this.pos = new Vec2();

	this.rad = 12;

}

Flag.prototype.update = function() {
	this.cooldown--;
	if (this.cooldown <= -1000) {
		this.pos.set(this.spawn);
		this.cooldown = 0;
	}
};