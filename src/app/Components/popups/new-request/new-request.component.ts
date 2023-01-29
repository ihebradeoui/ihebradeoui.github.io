import { Component, OnInit } from '@angular/core';
import { Request } from 'src/app/Models/Request';
import { AuthService } from 'src/app/Services/Authentication/auth.service';
import { RequestsService } from 'src/app/Services/Requests/requests.service';

@Component({
  selector: 'app-new-request',
  templateUrl: './new-request.component.html',
  styleUrls: ['./new-request.component.scss']
})
export class NewRequestComponent implements OnInit {

  constructor(private requestsService : RequestsService,private auth : AuthService) { }

  ngOnInit(): void {
  }

  selected_start_date = new Date(Date.now())
  selected_end_date = new Date(Date.now())
  selected_leave_type="";

  Leave_Type = [
    {value: 'Sick Leave', viewValue: 'Sick Leave'},
    {value: 'Unpaid Leave', viewValue: 'Unpaid Leave'},
    {value: 'Parental Leave', viewValue: 'Parental Leave'},
    {value: 'Vaccation Leave', viewValue: 'Vaccation Leave'},
    {value: 'Study Leave', viewValue: 'Study Leave'},
    {value: 'Public Holiday', viewValue: 'Public Holiday'},
    {value: 'Election Day', viewValue: 'Election Day'}
  ];

  date_difference(start_date: Date, end_date: Date): number {
    const diffTime = end_date.getTime() - start_date.getTime();
    const leaveDays = diffTime / (1000 * 60 * 60 * 24) + 1;
    return Math.floor(leaveDays);
  }

  Submit(){
    const difference = this.date_difference(this.selected_start_date, this.selected_end_date);
    const formData={
      start_date: this.selected_start_date,
      end_date: this.selected_end_date,
      days: difference+"", 
      leave_type: this.selected_leave_type,
      status:"In Progress"
    }
    this.requestsService.createRequest(new Request(this.auth.CurrentUserUid(),this.selected_start_date.toDateString(),this.selected_end_date.toDateString(),'Sick Leave',"tired"))
   console.log(formData)
  }
}
