import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { LoginComponent } from "./login/login.component";
import { MessagingComponent } from "./messaging/messaging.component";
import { RegisterComponent } from "./register/register.component";
import { DesktopComponent } from "./desktop/desktop.component";

const routes: Routes = [
  { path: "register", component: RegisterComponent },
  { path: "messaging", component: MessagingComponent },
  { path: "", component: LoginComponent },
  { path: "register", component: RegisterComponent },
  { path: "desktop", component: DesktopComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
