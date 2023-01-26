export class User { 
    public $key : string ;
    public email:string;
    public firstname:string;
    public lastname:string;
    public phone:string;
   constructor(em:string,nom:string,prenom:string,tel:string)
   {
       this.email=em;
       this.firstname=nom;
       this.lastname=prenom;
       this.phone=tel;
   }    
}