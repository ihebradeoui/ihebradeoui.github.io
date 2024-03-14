export class User {
  public $key: string;
  public email: string;
  public firstname: string;
  public lastname: string;
  public phone: string;
  public profilePhoto: any;
  constructor(
    em: string,
    nom: string,
    prenom: string,
    tel: string,
    profilePhoto: any
  ) {
    this.email = em;
    this.firstname = nom;
    this.lastname = prenom;
    this.phone = tel;
    this.profilePhoto = profilePhoto;
  }
}
