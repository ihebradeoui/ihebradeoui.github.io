import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Request } from 'src/app/Models/Request';
import { NewRequestComponent } from '../popups/new-request/new-request.component';

@Component({
  selector: 'app-information',
  templateUrl: './information.component.html',
  styleUrls: ['./information.component.scss']
})
export class InformationComponent implements OnInit {

  currentBalance = 1.84;
  constructor(public dialog: MatDialog) {}
  ngOnInit(): void {
    this.increse_Balance()
  }

  displayedColumns: string[] = ['id', 'start_date', 'end_date','treated_by','leave_type','request_status'];
  dataSource = new MatTableDataSource<Request>(ELEMENT_DATA);
  @ViewChild(MatPaginator) paginator: MatPaginator | any;

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }
  
  increse_Balance (){
    setInterval(() => {
      this.currentBalance += 1.84;
    }, 6000); 
  }

  open_dialog_for_new_Request() {
    this.dialog.open(NewRequestComponent);
  }
}

const ELEMENT_DATA: Request[] = [
 ];
