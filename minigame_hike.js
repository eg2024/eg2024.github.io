import { Scene } from "phaser";

export class Game extends Scene {
    constructor() {
        super("hike");
    }

    init(data) {
        this.data = data;
    }

    create() {
        window.scene = this;

        this.mountains = [
            [   0, "Lidingöbron"],
            [ 233, "Mount Inari"],
            [ 870, "Uetliberg"],
            [1136, "Lone Pine Peak"],
            [1372, "Mount Doom"],
            [1437, "Andermatt"],
            [1905, "Riederalp"],
            [3776, "Mount Fuji"],
            [4412, "Mount Whitney"],
            [8849, "Mount Everest"],
        ];

        const width = this.game.config.width;
        const height = this.game.config.height;

        // Add text to the scene
        let text = this.add.text(100, 100, 'This text will fade out', {
            font: '24px Arial',
            fill: '#ffffff'
        });

        // // Create a tween for fading out
        // this.tweens.add({
        //     targets: text, // the text object
        //     alpha: 0,      // fade to transparent
        //     ease: 'Linear', // easing function to use
        //     duration: 2000, // duration of the tween in milliseconds
        //     repeat: 0,      // repeat infinitely
        //     yoyo: false,    // apply the tween in reverse on alternate repeats
        //     onComplete: function () {
        //         text.destroy(); // optionally destroy text after fade
        //     }
        // });

        // Set background
        this.cameras.main.setBackgroundColor(0xffffff);

        // Add and scale background image
        this.backgroundImage = this.add.image(width / 2, height / 2, "hike_background");
        const scale = Math.max(width / this.backgroundImage.width, height / this.backgroundImage.height);
        this.backgroundImage.setScale(scale).setOrigin(0.5, 0.5);

        // Back button
        let back = this.add.image(width - 40, 40, "back").setInteractive();
        back.on("pointerdown", function (p) {
            this.scene.start("menu");
            this.scene.stop();
        }, this);
        this.back = back;

        // Score text
        this.score = 0;
        this.scoreText = this.add.text(width / 2, 80, this.score.toString(), {
            font: "60px Arial",
            fill: "#ffffff",
            align: "center",
        }).setOrigin(0.5, 0.5);

        this.timeTicks = 0; // set to 2000 to start at a score of 100
        this.gameOver = false;

        // Players
        let klara = this.add.sprite(0, 0, 'hike_player3').setScale(1);
        let gabca = this.add.sprite(0, 0, 'hike_player2').setScale(1);
        let erik =  this.add.sprite(0, 0, 'hike_player1').setScale(1);
        this.players = [klara, gabca, erik];

        // Adjust positions
        klara.x = klara.width/2;
        gabca.x = klara.x + klara.width/2 + gabca.width/2;
        erik.x = gabca.x + gabca.width/2 + erik.width/2 - 5;
        erik.y = height * 0.84;
        gabca.y = erik.y + (erik.height - gabca.height)/2;
        klara.y = erik.y + (erik.height - klara.height)/2;
        erik.y -= 5;

        this.isJumping = [false,false,false];
        this.maxJumpHeight = height * 0.40; // Predefined maximum height of the jump
        this.groundLevel = erik.y + erik.height/2;

        //alert(this.isOnGround(0) + " " + this.isOnGround(1) + " " + this.isOnGround(2));

        this.pointerHistory = Array(10).fill(false);
        this.pointeriscurrentlydown = false;
        this.input.on('pointerdown', () => this.pointeriscurrentlydown = true);
        this.input.on('pointerup', () => this.pointeriscurrentlydown = false);

        // Initialize jump variables
        this.jumpVelocity = [5,5,5]; // current velocity of player
        this.gravity = 0.2;  // Adjust gravity strength here
        this.jumpSpeed = -10; // Constant speed of rising
        this.playerInitialY = [klara.y, gabca.y, erik.y];

        // set to 0.5 for easy, to 1 for normal, to 2 for super hard.
        // this changes dynamically as the game progresses.
        this.speedDifficulty = 0.5;

        // Dinosaur group
        this.dinos = this.add.group();

        // Spawning dinos at random intervals
        this.time.delayedCall(this.randomBetween(500, 1000), this.spawnDino, [], this);

        // Update the game state
        this.time.addEvent({
            delay: 20,
            callback: () => {
                this.updatePointerHistory(this.pointeriscurrentlydown);

                this.adjustDifficulty();

                this.applyDayNightCycle();

                if (!this.gameOver) {
                    this.timeTicks += 1;
                    this.score = this.timeTicks / 20;
                    // about 10 meters per second. a decent run will be about 1000m which is decent hike
                    // an elite player might get reach a score of mount everest
                    let visible_score = 10 * Math.floor(this.score);
                    this.scoreText.setText(visible_score + "m");

                    this.updateJump();
                    this.updateDinos();
                }
                this.checkCollisions();
            },
            callbackScope: this,
            loop: true
        });

        this.seen_friends = false;
        this.intro();
    }

    isOnGround(playerId) {
        return this.players[playerId].y + this.players[playerId].height/2 >= this.groundLevel;
    }

    hasReachedMaxHeight(playerId) {
        return this.players[playerId].y + this.players[playerId].height/2 <= this.maxJumpHeight;
    }

    updatePointerHistory(isdown) {
        // Add the current pointer state to the history
        this.pointerHistory.unshift(isdown);
    
        // Ensure pointerHistory always has exactly 10 elements
        if (this.pointerHistory.length > 10) {
            this.pointerHistory.pop();
        }
    }

    // Modify difficulty based on score
    // It should start at 0.5 and go up to 1 at about a score of 50 and then go up to about 2 by score 400
    adjustDifficulty() {
        if (this.score < 50)
            this.speedDifficulty = this.lerp(0.5, 1, this.score/50);
        else if (this.score < 100)
            this.speedDifficulty = 1;
        else if (this.score > 100)
            this.speedDifficulty = this.lerp(1, 2, (this.score-100)/300);
    }

    applyDayNightCycle() {
        // Apply night tint when game has gone on long enough
        //if (this.score > 100)
        {
            // The value below oscillates between 0 and 1
            let darkness = (this.roundedSquareWave(this.timeTicks / 8000 * Math.PI * 2)+1)/2;
            let grn = Math.min(0xff, Math.round(this.lerp(0x55, 0xff, darkness + 0.1)));
            let blu = Math.min(0xff, Math.round(this.lerp(0x44, 0xff, darkness + 0.1)));
            let red = Math.min(0xff, Math.round(this.lerp(0x33, 0xff, darkness + 0.1)));
            let colormask = grn + blu*256 + red*256*256;
            this.backgroundImage.setTint(colormask);
        }
    }

    // oscillates between -1 and 1 but is more square than a sine wave.
    // has a period of 2pi.
    roundedSquareWave(x) {
        return Math.atan(Math.sin(x)*10)*2/Math.PI;
    }

    lerp(start, end, t) {
        if (t < 0)
            return start;
        if (t > 1)
            return end;
        return (1 - t) * start + t * end;
    }

    weightedRandom(items, weights) {
        let totalWeight = weights.reduce((total, weight) => total + weight, 0);
        let randomNum = Math.random() * totalWeight;
        let weightSum = 0;
    
        for (let i = 0; i < items.length; i++) {
            weightSum += weights[i];
            if (randomNum <= weightSum) {
                return items[i];
            }
        }
    }

    spawnDino() {
        const sprites = ["hike_dino", "hike_pterodactyl", "hike_rock", "hike_treestump", "hike_tree", "hike_funicular", "hike_geometry_dash"];
        const weights = [100,30,100,100,30,3,3];
    
        let sprite = this.weightedRandom(sprites, weights);

        const visible_score = Math.floor(this.score) * 10;
        if (!this.seen_friends && visible_score > 2000 && sprite == "hike_rock") {
            sprite = "hike_friends"
            this.seen_friends = true;
        }

        const dino = this.add.sprite(this.game.config.width + 50, this.game.config.height * 0.73, sprite);
        dino.setScale(this.game.config.width * 0.15 / dino.width);

        dino.vx = -6;
        dino.vy = 2;
        dino.rotation_speed = 0;
        dino.is_jumping = false;
        dino.has_started_moving = false;


        if (sprite == "hike_friends") {
            dino.setScale(this.game.config.width * 0.15 / dino.width * 1.50);
            dino.y -= 20;
        }
        if (sprite == "hike_tree") {
            dino.setScale(this.game.config.width * 0.15 / dino.width * 2);
            dino.y -= 20;
        }
        if (sprite == "hike_rock") {
            dino.rotation_speed = -8; // degrees per frame
        }
        if (sprite == "hike_geometry_dash") {
            dino.setScale(this.game.config.width * 0.15 / dino.width * 0.5);
            dino.y -= 5;
            dino.is_jumping = true;
        }
        if (sprite == "hike_funicular") {
            dino.setScale(this.game.config.width * 0.15 / dino.width * 2);
            dino.y = this.randomBetween(this.game.config.height * 0.2, this.game.config.height * 0.45);
            dino.y -= 20;
        }
        if (sprite == "hike_dino") {
            // Make dino twice as large in rare cases
            if (Math.random() < 0.1)
                dino.setScale(this.game.config.width * 0.15 / dino.width * 2);
        }
        if (sprite == "hike_pterodactyl") {
            dino.y = this.randomBetween(this.game.config.height * 0.2, this.game.config.height * 0.5);
            dino.vx = -3;
            dino.vy = 0;
        }
        this.dinos.add(dino);

        // Schedule the next dinosaur spawn with a new random delay
        if (!this.gameOver)
            this.time.delayedCall(this.randomBetween(100 / this.speedDifficulty, 3000 / this.speedDifficulty), this.spawnDino, [], this);
    }

    updateDinos() {
        if (!this.gameOver) {
            this.dinos.getChildren().forEach(dino => {
                dino.x += dino.vx * this.speedDifficulty;
                dino.y += dino.vy * this.speedDifficulty;
                if (dino.rotation_speed != 0)
                    dino.angle += dino.rotation_speed;

                if (dino.is_jumping) {
                    // Very clumsy way of making an enemy jump sometimes
                    // Essentially I add a sine wave to its movement but only the positive part,
                    // and when it's jumping it also rotates by a full rotation.

                    function addedJumpDisplacement(x) {
                        return -40*Math.max(0, Math.sin(x/8));
                    }
    
                    dino.rotation = addedJumpDisplacement(this.timeTicks) < 0? -2 * (this.timeTicks/8) : 0;
                    dino.y += addedJumpDisplacement(this.timeTicks); 
                    if (dino.has_started_moving)
                        dino.y -= addedJumpDisplacement(this.timeTicks-1);
                }

                dino.has_started_moving = true;
            });
        }
    }

    updateJump() {
        if (this.gameOver)
            return;

        let jumpDelays = [6, 3, 0]; // Delays for each player
        if (!this.players[2].active) {
            jumpDelays = [3, 0, 0];
            if (!this.players[1].active)
                jumpDelays = [0,0,0];
        }

        this.players.forEach((player, i) => {
            if (this.pointerHistory[jumpDelays[i]]) {
                if (this.isOnGround(i)) {
                   this.isJumping[i] = true;
                }
            }
            else
                this.isJumping[i] = false; // Stop jumping when the pointer is released

            if (this.isJumping[i] && !this.hasReachedMaxHeight(i)) {
                // While the player is holding down, and hasn't reached max height, move up
                player.y += this.jumpSpeed * this.speedDifficulty; // constant speed up
                this.jumpVelocity[i] = -this.jumpSpeed; // speed to use when you start falling
            } else {
                this.isJumping[i] = false;
                // Apply gravity normally to fall
                this.jumpVelocity[i] += this.gravity;
                player.y += this.jumpVelocity[i] * this.speedDifficulty;
        
                if (this.isOnGround(i)) {
                    // Stop falling and reset on the ground
                    player.y = this.playerInitialY[i];
                    this.jumpVelocity[i] = 0; // Reset the velocity
                }
            }
        });
    }
    
    
    

    checkCollisions() {
        this.dinos.getChildren().forEach(dino => {
            this.players.forEach((player, index) => {
                if (player.active && this.rectsOverlap(player.getBounds(), dino.getBounds())) {
                    player.setVisible(false); // Hide player on collision
                    player.setActive(false); // Disable player
                    this.checkGameOver();
                }
            });
        });
    }

    checkGameOver() {
        // Game over when all players are inactive
        if (this.players.every(player => !player.active)) {
            this.gameover();
        }
    }

    rectsOverlap(rectA, rectB) {
        const leniency = 0.8;
        return rectA.x < rectB.x + rectB.width * leniency &&
               rectA.x + rectA.width * leniency > rectB.x &&
               rectA.y < rectB.y + rectB.height * leniency &&
               rectA.height * leniency + rectA.y > rectB.y;
    }

    intro() {
        let msg = "On weekends, Erik and Gabriela go for adventures. \n\nHelp them jump over obstacles.";
        let highscore = JSON.parse(localStorage.getItem('highscore_hike')) || 0;
        if (highscore > 0)
            msg += "\n\nHighscore: " + highscore + "m";

        if (!this.data["restart"]) {
            this.scene.launch("intro", {
                "minigame": this,
                "text": msg,
            });
            this.scene.pause();
        }
    }

    gameover() {
        if (this.gameOver) return;  // This can be called multiple times before scene is paused.
        this.gameOver = true;

        this.back.visible = false;

        let visible_score = Math.floor(this.score) * 10;

        let highscore = JSON.parse(localStorage.getItem('highscore_hike')) || 0;
        let newhighscore = highscore < visible_score;
        highscore = Math.max(highscore, visible_score);
        if (!(typeof highscore === 'number' && isFinite(highscore) && highscore > 0))
            highscore = 0;
       localStorage.setItem('highscore_hike', JSON.stringify(highscore));

        let climbing_text = "You can do better than that.";
        for (let i = 0; i < this.mountains.length; i++) {
            if (visible_score >= this.mountains[i][0])
            climbing_text = "This is higher than " + this.mountains[i][1] + ".";
        }

        let msg = "You helped the family hike " + visible_score  + "m.\n\n" + climbing_text;
        if (newhighscore)
            msg += "\n\nNEW HIGHSCORE!"
        else
            msg += "\n\nHighscore: " + highscore + "m";
        

        this.scene.launch("gameover", {
            "minigame": this,
            "text": msg,
        });
        this.scene.pause();
    }

    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

}