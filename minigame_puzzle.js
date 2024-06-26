import { Scene } from "phaser";

const ALL_PUZZLES = [
    "puzzle_e0",  "puzzle_e1",
    "puzzle_eg0", "puzzle_eg1",
    "puzzle_k0",  "puzzle_k1",
    "puzzle_g0",
    "puzzle_j0",
    "puzzle_bam", "puzzle_death_valley",
];


function shuffleArray(array) {
    let currentIndex = array.length;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {

      // Pick a remaining element...
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
}


function bake_texture(scene, image, mask) {
    // Dynamically creates a texture which is a combination of rendering
    // "image" with "mask". This texture ends up being a CanvasRenderingContext2D
    // which is annoying for detecting touch, but still its nice to be dynamic
    // so that we can try any combination of input image and puzzle pieces.

    //const name = image + "_" + mask;
    //if (scene.textures.exists(name)) {
    //    return scene.textures.get(name);
    //}
    // Note dont keep more baked textures than needed. Destroy old one.
    const name = "bake_" + mask;
    if (scene.textures.exists(name)) {
        scene.textures.remove(name);
    }

    const mask_obj = scene.make.image({key: mask, origin: {x: 0, y: 0}, add: false});
    const image_obj = scene.make.image({key: image, origin: {x: 0, y: 0}, add: false});
    image_obj.mask = new Phaser.Display.Masks.BitmapMask(scene, mask_obj);

    // Render the image which has a mask onto a dynamic texture.
    // Maybe consider render into a png and then use it without having to deal with
    // the complexity and slowness of detecting hits with CanvasRenderingContext2D.
    const texture = scene.textures.addDynamicTexture(name, image_obj.width, image_obj.height);
    texture.draw(image_obj);

    return texture;
}

function texture_hitAreaCallback(hitArea, x, y, gameObject) {
    // When using a dynamic texture, we have to set a hitAreaCallback.
    // Otherwise it tries to go through a non existing function in
    // a CanvasRenderingContext2D.
    const texture = gameObject.texture;
    if (x < 0 || x >= texture.width || y < 0 | y >= texture.height) {
        return false;  // Fast path
    }

    // Potentially slow.
    const capture = [];
    texture.snapshotPixel(x, y, (color) => { capture.push(color); });
    return capture[0].a >= 127;
}

export class Game extends Scene
{
    constructor() {
        super("puzzle");
    }

    init(data) {
        this.data = data;
    }

    create() {
        window.scene = this;

        this.texture = this.pickPuzzle();

        const width = this.game.config.width;
        const height = this.game.config.height;

        // Set background
        this.cameras.main.setBackgroundColor(0xffffff);

        // Add back button.
        let back = this.add.image(width - 40, 40, "back");
        back.setInteractive();
        back.on("pointerdown", function (p) {
            this.scene.start("menu");
            this.scene.stop();
        }, this);
        this.back = back;

        // This scene keeps track of lists of groups of pieces.
        // Maybe re-implement using disjoint-set structure and merging ids.
        const areTwoPiecesTogether = (pieceA, pieceB) => {
            // They are together if they are adjacent and if their locations
            // is within "10px" distance.
            const original_dx = Math.abs(pieceA.originalX - pieceB.originalX);
            const original_dy = Math.abs(pieceA.originalY - pieceB.originalY);
            if ((original_dx + original_dy) > 1) {
                return false;
            }

            const dx = Math.abs(pieceA.x - pieceB.x);
            const dy = Math.abs(pieceA.y - pieceB.y);
            return (dx + dy) < 10;
        }

        const setPositionToPieces = (pieces, x, y) => {
            pieces.forEach(piece => {
                piece.setPosition(x, y);
            });
        }

        const setIdToPieces = (pieces, id) => {
            pieces.forEach(piece => {
                piece.id = id;
            })
        }


        const initialPositions = [...Array(12).keys()];
        shuffleArray(initialPositions);

        const pieces = [];
        this.pieces = pieces;

        const startingPositionX = 150;
        const startingPositionY = 170;
        const pieceSize = 67;

        for (let i=0; i<12; i++) {
            const texture = bake_texture(this, this.texture, 'puzzle_a' + i);
            const item = this.add.image(0, 0, texture);
            item.setInteractive({
                draggable: true,
                hitArea: new Phaser.Geom.Rectangle(0, 0, texture.width, texture.height),
                hitAreaCallback: texture_hitAreaCallback,
            });

            item.id = i;
            item.originalX = i%3;
            item.originalY = Math.floor(i/3);

            const initialPosition = initialPositions[i];
            const initialX = Math.floor(initialPosition/6);
            const initialY = initialPosition%6;

            const startX = (startingPositionX - pieceSize + 30) + (200 * initialX) - item.originalX * pieceSize;
            const startY = startingPositionY + ((pieceSize + 30) * initialY) - item.originalY * pieceSize;

            item.setPosition(startX, startY);
            
            item.on('drag', function(pointer, dragX, dragY){
                setPositionToPieces(pieces[item.id], dragX, dragY);
            }, this);

            item.on('dragend', function(pointer, dragX, dragY, dropped){
                pieces[item.id].forEach(piece => {
                    for (const [key, value] of Object.entries(pieces)) {
                        const basePiece = value[0];

                        if (item.id == basePiece.id) {
                            continue;
                        }
    
                        if (areTwoPiecesTogether(piece, basePiece)) {
                            setPositionToPieces(pieces[item.id], basePiece.x, basePiece.y)
                            pieces[basePiece.id] = pieces[basePiece.id].concat(pieces[item.id]);
                            setIdToPieces(pieces[basePiece.id], basePiece.id);
                        }
                    }
                });

                // Detect game over.
                pieces.forEach(p => {
                    if (p.length == pieces.length) {
                        this.gameover();
                    }
                });
            }, this);

            pieces[i] = [item];
        }

        this.intro();
    }

    pickPuzzle() {
        // Retrieve played puzzles from local storage
        // This will reset once all puzzles have been solved
        let playedPuzzles = JSON.parse(localStorage.getItem('playedPuzzles')) || [];

        // Filter out played puzzles
        let puzzles = ALL_PUZZLES.filter(p => !playedPuzzles.includes(p));
        if (puzzles.length === 0) {
            puzzles = ALL_PUZZLES;
            localStorage.setItem('playedPuzzles', JSON.stringify([]));
        }
        //console.log(playedPuzzles);

        return puzzles[Math.floor(Math.random() * puzzles.length)];
    }

    numDonePuzzlesEver() {
        // Retrieve played puzzles from local storage
        // This will reset once all puzzles have been solved
        let playedPuzzles = JSON.parse(localStorage.getItem('playedPuzzles')) || [];

        // Retrieve total solved puzzles ever from local storage
        // This will never reset
        let numDonePuzzlesEver = JSON.parse(localStorage.getItem('numDonePuzzlesEver')) || 0;
        return Math.max(numDonePuzzlesEver, playedPuzzles.length);
    }

    intro() {
        let numTot = ALL_PUZZLES.length;
        let numDone = this.numDonePuzzlesEver();
        let msg = "Klara loves to do puzzles. Especially with some help.\n\nYou have helped Klara solve " + numDone + " out of " + numTot + " puzzles.";
        if (!this.data["restart"]) {
            this.scene.launch("intro", {
                "minigame": this,
                "text": msg,
            });
            this.scene.pause();
        }
    }

    gameover() {
        this.back.visible = false;

        // Add current puzzle to played puzzles and save to local storage
        let playedPuzzles = JSON.parse(localStorage.getItem('playedPuzzles')) || [];
        playedPuzzles.push(this.texture);
        localStorage.setItem('playedPuzzles', JSON.stringify(playedPuzzles));
        localStorage.setItem('numDonePuzzlesEver', JSON.stringify(this.numDonePuzzlesEver()));

        let numTot = ALL_PUZZLES.length;
        let numDone = this.numDonePuzzlesEver();
        let msg = numTot > numDone? 
            "You have helped Klara solve " + numDone + " out of " + numTot + " puzzles. Try another!" :
            "You have solved all of Klara's puzzles!";

        this.scene.launch("gameover", {
            "minigame": this,
            "image": this.texture,
            "alpha": 0.98,
            "text": msg,
        });
        this.scene.pause();
    }
}
