import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { Request } from 'src/app/Models/Request';
import { RequestsService } from 'src/app/Services/Requests/requests.service';
import { NewRequestComponent } from '../popups/new-request/new-request.component';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss']
})
export class RequestsComponent implements OnInit {
  requests:Request[]=[]
  constructor(private router: Router,public dialog: MatDialog ,private requestsService: RequestsService) { }

  displayedColumns: string[] = ['id', 'employee', 'start_date', 'end_date','type','comment','status'];
  dataSource = new MatTableDataSource<Request>(this.requests);
  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  
  ngOnInit(): void {
    this.requestsService.getRequests().subscribe((data)=>this.listRequests(data))
    //    if not admin :
    //    this.requestsService.getRequestByUser(this.auth.CurrentUserUid()).subscribe((data)=>this.listRequests(data))

  }
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  listRequests(entries: any[]){
    this.requests = [];
    entries.forEach(element => {
     let y = element.payload.toJSON()
     y["$key"] = element.key
     this.requests.push(y as Request)
      })
      this.dataSource=new MatTableDataSource<Request>(this.requests);
      console.log(this.requests)
    }

addRequest()
{this.router.navigate(["/newRequest"])}

}
