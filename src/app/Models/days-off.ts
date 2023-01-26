export class DaysOff {
    public $key : string ;
    public userUid:string;
    public value:number;
   
   constructor(user : string , val : number)
   {
       this.userUid=user;
       this.value=val;
   }   
}
