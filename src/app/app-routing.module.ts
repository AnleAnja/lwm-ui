import {NgModule} from '@angular/core'
import {RouterModule, Routes} from '@angular/router'

import {CoursesComponent} from './courses/courses.component'
import {EmployeeDashboardComponent} from './dashboard/employee-dashboard/employee-dashboard.component'
import {StudentDashboardComponent} from './dashboard/student-dashboard/student-dashboard.component'
import {DegreeComponent} from './degrees/degree.component'
import {EntryPageComponent} from './entry-page/entry-page.component'
import {DashboardGuard} from './guards/dashboard.guard'
import {EmployeeStatusGuard} from './guards/employee-status.guard'
import {StudentStatusGuard} from './guards/student-status.guard'
import {RoomComponent} from './rooms/room.component'
import {SemestersComponent} from './semesters/semesters.component'
import {UsersComponent} from './users/users.component'
import {BlacklistsComponent} from './blacklists/blacklists.component'
import {LabworksComponent} from './labworks/labworks.component'
import {LabworkApplicationsComponent} from './labwork-applications/labwork-applications.component'
import {GroupsComponent} from './groups/groups.component'
import {LabworkChainComponent} from './labwork-chain/labwork-chain.component'

const routes: Routes = [
    {
        path: 's',
        component: StudentDashboardComponent,
        canActivate: [StudentStatusGuard],
        children: []
    },
    {
        path: 'e',
        canActivate: [EmployeeStatusGuard],
        children: [
            {
                path: 'authorities',
                component: UsersComponent
            },
            {
                path: 'modules',
                component: CoursesComponent
            },
            {
                path: 'rooms',
                component: RoomComponent
            },
            {
                path: 'degrees',
                component: DegreeComponent
            },
            {
                path: 'semesters',
                component: SemestersComponent
            },
            {
                path: 'blacklists',
                component: BlacklistsComponent
            },
            {
                path: '',
                component: EmployeeDashboardComponent
            },
            {
                path: 'courses/:cid',
                children: [
                    {
                        path: 'labworks/:lid/applications',
                        component: LabworkApplicationsComponent
                    },
                    {
                        path: 'labworks/:lid/groups',
                        component: GroupsComponent
                    },
                    {
                        path: 'labworks/:lid/chain',
                        children: [
                            {
                                path: '',
                                component: LabworkChainComponent
                            }
                        ]
                    },
                    {
                        path: '',
                        component: LabworksComponent
                    }
                ]
            }
        ]
    },
    {
        path: '',
        component: EntryPageComponent,
        canActivate: [DashboardGuard]
    },
    {
        path: '**',
        redirectTo: '',
        pathMatch: 'full'
    }
]

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
