export class Request {
    $key: string;
    employee: string;
    start_date: string;
    end_date: string;
    type: string;
    comment : string
    status : string

constructor(employe:string , start:string,end :string, type :string, reason :string,status? : string)
{this.employee=employe
this.start_date=start;
this.end_date=end;
this.type=type;
this.comment=reason;
this.status=status
}

}