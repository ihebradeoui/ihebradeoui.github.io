import { Coordinates } from "../utilities/coordinates";

export class AnimalData {
    name: string;
    thirst: number;
    hunger: number;
    desire: number;
    coordinates: Coordinates
    species: string;
    gender: number;

    constructor() {
        this.name = "";
        this.thirst = 0;
        this.hunger = 0;
        this.desire = 1;
        this.coordinates = new Coordinates('thing', 0, 10, 0);
        this.species = 'rabbit';
        this.gender = 0;
    }
}
