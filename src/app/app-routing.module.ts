import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './Components/dashboard/dashboard.component';
import { EmployeesComponent } from './Components/employees/employees.component';
import { LoginComponent } from './Components/login/login.component';
import { NewRequestComponent } from './Components/popups/new-request/new-request.component';
import { RequestsComponent } from './Components/requests/requests.component';

const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'employees', component: EmployeesComponent },
  { path: 'requests', component: RequestsComponent },
  { path: 'login', component: LoginComponent }  ,
  {path:'newRequest', component:NewRequestComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
