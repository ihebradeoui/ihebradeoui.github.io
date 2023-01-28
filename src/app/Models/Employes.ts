import { IDepartement } from "./Departements";

export interface IEmployees {
    id:string;
    matricule?:string;
    fullname?: string;
    function?: string;
    email?: string;
    phone?: string;
    managers?: IEmployees
    city?: string;
    country?: string;
    marital_status?: string;
    date_of_birth?: string;  
    number_of_children?: string;
    security_number?: string;
    departement?: IDepartement;
}