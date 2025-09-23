import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { ExecException } from 'child_process';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { debounceTime, distinctUntilChanged, throttleTime } from 'rxjs/operators';
import { Coordinates } from '../objects/utilities/coordinates';


@Injectable({
  providedIn: 'root'
})
export class MovementService {
  private updateQueue = new Subject<{coordinates: Coordinates, lobby: string}>();
  private localCoordinatesCache: {[lobbyUserId: string]: Coordinates} = {};
  private lastUpdateTime: {[lobbyUserId: string]: number} = {};
  private readonly UPDATE_THROTTLE_MS = 100; // Limit updates to once per 100ms per user
  
  CoordinatesLists: AngularFireList<any>;

  constructor(public db: AngularFireDatabase) {
    this.CoordinatesLists = db.list('coordinates');
    
    // Set up throttled update processing
    this.updateQueue.pipe(
      throttleTime(50), // Throttle to max 20 updates per second globally
      distinctUntilChanged((prev, curr) => 
        prev.coordinates.user === curr.coordinates.user && 
        prev.lobby === curr.lobby &&
        this.coordinatesEqual(prev.coordinates, curr.coordinates)
      )
    ).subscribe(update => {
      this.performFirebaseUpdate(update.coordinates, update.lobby);
    });
  }

  private coordinatesEqual(coord1: Coordinates, coord2: Coordinates): boolean {
    const threshold = 0.1; // Only update if position changed by more than 0.1 units
    return Math.abs(coord1.x - coord2.x) < threshold &&
           Math.abs(coord1.y - coord2.y) < threshold &&
           Math.abs(coord1.z - coord2.z) < threshold;
  }

  private performFirebaseUpdate(coordinates: Coordinates, lobby: string): void {
    const lobbyUserId = `${lobby}:${coordinates.user}`;
    const now = Date.now();
    
    // Check if enough time has passed since last update for this user
    if (this.lastUpdateTime[lobbyUserId] && 
        now - this.lastUpdateTime[lobbyUserId] < this.UPDATE_THROTTLE_MS) {
      return;
    }
    
    this.lastUpdateTime[lobbyUserId] = now;
    this.localCoordinatesCache[lobbyUserId] = coordinates;
    
    this.db.list('/coordinates/' + lobby).update(coordinates.user, {
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z
    }).catch(() => {
      // If update fails, try to initialize the lobby
      this.initLobby(coordinates, lobby);
    });
  }

  reset() {
    this.db.list('coordinates').remove();
  }

  getAllCoordinates(lobby: string): Observable<any> {
    return this.db.list('coordinates/' + lobby).snapshotChanges();
  }

  getAllLobbies(): Observable<any> {
    return this.db.list('coordinates').snapshotChanges();
  }

  addCoordinates(x: number, y: number, z: number) {
    this.CoordinatesLists.push(new Coordinates("thing", x + 10, y, z + 10));
  }

  getCoordinatesByUser(user: any, lobby: string): Observable<any> {
    return this.db.list('coordinates/' + lobby, ref => ref.orderByChild("user").equalTo(user).limitToFirst(1)).snapshotChanges();
  }

  // Optimized update method that uses throttling
  updateCoordinatesByUser(coordinates: Coordinates, lobby: string): void {
    const lobbyUserId = `${lobby}:${coordinates.user}`;
    
    // Check local cache first to avoid unnecessary updates
    if (this.localCoordinatesCache[lobbyUserId] && 
        this.coordinatesEqual(this.localCoordinatesCache[lobbyUserId], coordinates)) {
      return; // No change, skip update
    }
    
    // Queue the update for throttled processing
    this.updateQueue.next({ coordinates, lobby });
  }

  async initLobby(coordinates: Coordinates, lobby: string) {
    const updated = await this.db.list('coordinates/' + lobby).push(coordinates);
  }

  async pushToLobby(lobby: string, coordinates: Coordinates) {
    this.db.list("coordinates/" + lobby).push(coordinates);
  }

  async updateCoordinatesInLobby(lobby: string, coordinates: Coordinates) {
    // Use the optimized update method instead
    this.updateCoordinatesByUser(coordinates, lobby);
  }

  // Get cached coordinates for immediate use (reduces Firebase reads)
  getCachedCoordinates(lobby: string, user: string): Coordinates | null {
    const lobbyUserId = `${lobby}:${user}`;
    return this.localCoordinatesCache[lobbyUserId] || null;
  }

}
