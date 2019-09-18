import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core'
import {Observable, Subscription} from 'rxjs'
import {LabworkAtom} from '../models/labwork.model'
import {ActivatedRoute} from '@angular/router'
import {LabworkService} from '../services/labwork.service'
import {foldUndefined, NotImplementedError, subscribe} from '../utils/functions'
import {TimetableAtom} from '../models/timetable'
import {
    fetchApplicationCount,
    fetchLabwork,
    fetchOrCreateAssignmentPlan,
    fetchOrCreateTimetable,
    fetchReportCardEntryCount,
    fetchScheduleEntries
} from './labwork-chain-view-model'
import {TimetableService} from '../services/timetable.service'
import {ScheduleEntryService, SchedulePreview} from '../services/schedule-entry.service'
import {ScheduleEntryAtom} from '../models/schedule-entry.model'
import {MatHorizontalStepper} from '@angular/material'
import {AssignmentPlanService} from '../services/assignment-plan.service'
import {AssignmentPlan} from '../models/assignment-plan.model'
import {BlacklistService} from '../services/blacklist.service'
import {LabworkApplicationService} from '../services/labwork-application.service'
import {ReportCardEntryService} from '../services/report-card-entry.service'
import {userAuths} from '../security/user-authority-resolver'
import {hasAdminStatus, isCourseManager} from '../utils/role-checker'

enum Step {
    application,
    timetable,
    blacklists,
    groups,
    schedule,
    closing
}

type GroupViewMode = 'waitingForApplications' | 'waitingForPreview' | 'groupsPresent'

@Component({
    selector: 'lwm-labwork-chain',
    templateUrl: './labwork-chain.component.html',
    styleUrls: ['./labwork-chain.component.scss']
})
export class LabworkChainComponent implements OnInit, OnDestroy {

    // TODO permissions if locked or unlocked and user privilege
    // TODO copy assignment plan for other degree within same semester
    // TODO pretty report-cards and next/prev buttons

    private subs: Subscription[]

    private labwork: Readonly<LabworkAtom>
    private timetable: Readonly<TimetableAtom>
    private assignmentPlan: Readonly<AssignmentPlan>
    private schedulePreview: Readonly<SchedulePreview> | undefined
    private scheduleEntries: Readonly<ScheduleEntryAtom[]>
    private applications: Readonly<number>
    private reportCards: Readonly<number>

    private steps: Step[]

    @ViewChild('stepper', {static: false}) stepper: MatHorizontalStepper

    constructor(
        private readonly route: ActivatedRoute,
        private readonly labworkService: LabworkService,
        private readonly timetableService: TimetableService,
        private readonly blacklistService: BlacklistService,
        private readonly scheduleEntryService: ScheduleEntryService,
        private readonly assignmentPlanService: AssignmentPlanService,
        private readonly labworkApplicationService: LabworkApplicationService,
        private readonly reportCardService: ReportCardEntryService,
    ) {
        this.subs = []
        this.steps = [
            Step.application,
            Step.timetable,
            Step.blacklists,
            Step.groups,
            Step.schedule,
            Step.closing
        ]
    }

    ngOnInit() {
        console.log('chain loaded')

        this.fetchChainData()
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe())
    }

    private updateLabwork = (l: LabworkAtom) => {
        this.labwork = l
    }

    private updateTimetable = (t: TimetableAtom) => {
        this.timetable = t
    }

    private updateAssignmentPlan = (a: AssignmentPlan) => {
        this.assignmentPlan = a
    }

    private updateSchedulePreview = (p: SchedulePreview) => {
        this.schedulePreview = p
    }

    private deleteScheduleEntries = () => {
        this.scheduleEntries = []
        this.jumpToGroups()
    }

    private deleteReportCards = () => {
        this.reportCards = 0
    }

    private createScheduleEntries = (es: ScheduleEntryAtom[]) => {
        this.scheduleEntries = es
        this.schedulePreview = undefined
    }

    private createReportCards = (n: number) => {
        this.reportCards = n
    }

    private deleteSchedulePreview = () => {
        this.schedulePreview = undefined
        this.jumpToGroups()
    }

    private jumpToGroups = () => this.stepper.selectedIndex = Step.groups.valueOf()

    private fetchChainData = () => {
        const s1 = fetchLabwork(this.route, this.labworkService, labwork => {
            this.labwork = labwork

            this.subscribeAndPush(fetchOrCreateAssignmentPlan(this.assignmentPlanService, labwork), ap => this.assignmentPlan = ap)
            this.subscribeAndPush(fetchOrCreateTimetable(this.timetableService, this.blacklistService, labwork), tt => this.timetable = tt)
            this.subscribeAndPush(fetchApplicationCount(this.labworkApplicationService, labwork), a => this.applications = a)
            this.subscribeAndPush(fetchScheduleEntries(this.scheduleEntryService, labwork), s => this.scheduleEntries = s)
            this.subscribeAndPush(fetchReportCardEntryCount(this.reportCardService, labwork), n => this.reportCards = n)
        })

        this.subs.push(s1)
    }

    private subscribeAndPush = <T>(o: Observable<T>, f: (t: T) => void) => {
        this.subs.push(subscribe(o, f))
    }

    private label = (step: Step): string => {
        switch (step) {
            case Step.application:
                return 'Ablaufplan'
            case Step.timetable:
                return 'Rahmenplan'
            case Step.blacklists:
                return 'Geblockte Tage'
            case Step.groups:
                return 'Gruppen'
            case Step.schedule:
                return 'Staffelplan'
            case Step.closing:
                return 'Abschluss'
        }
    }

    private next = (step: Step): Step | undefined => {
        return this.steps[step.valueOf() + 1]
    }

    private prev = (step: Step): Step | undefined => {
        return this.steps[step.valueOf() - 1]
    }

    private nextButtonLabel = (step: Step): string => {
        return foldUndefined(this.next(step), this.label, () => '???')
    }

    private prevButtonLabel = (step: Step): string => {
        return foldUndefined(this.prev(step), this.label, () => '???')
    }

    private hasNextButton = (step: Step): boolean => {
        return this.next(step) !== undefined
    }

    private hasPrevButton = (step: Step): boolean => {
        return this.prev(step) !== undefined
    }

    private isStepCompleted = (step: Step): boolean => {
        switch (step) {
            case Step.application:
            case Step.timetable:
            case Step.blacklists:
                return true
            case Step.groups:
                return this.hasSchedulePreview() || this.hasScheduleEntries()
            case Step.schedule:
                return this.hasScheduleEntries()
            case Step.closing:
                return this.isStepCompleted(Step.schedule) && this.hasReportCardEntries()
        }
    }

    private hasPermission = (): boolean => {
        const auths = userAuths(this.route)
        return isCourseManager(this.labwork.course.id, auths) || hasAdminStatus(auths)
    }

    private isStepLocked = (step: Step): boolean => {
        if (!this.hasPermission()) {
            return true
        }

        switch (step) {
            case Step.application:
            case Step.timetable:
            case Step.blacklists:
                return this.hasSchedulePreview() || this.hasScheduleEntries() || this.hasReportCardEntries()
            case Step.groups:
                return NotImplementedError('use groupViewMode() instead')
            case Step.schedule:
                return !this.hasSchedulePreview() && this.hasScheduleEntries()
            case Step.closing:
                return this.isStepLocked(Step.schedule) && this.hasReportCardEntries()
        }
    }

    private hasReportCardEntries = () => this.reportCards > 0

    private hasScheduleEntries = () => foldUndefined(this.scheduleEntries, xs => xs.length > 0, () => false)

    private hasSchedulePreview = () => foldUndefined(this.schedulePreview, () => true, () => false)

    private groupViewMode = (): GroupViewMode => {
        if (this.applications > 0) {
            if (this.hasScheduleEntries()) {
                return this.groupsPresent()
            } else {
                return this.waitingForPreview()
            }
        } else {
            return this.waitingForApplications()
        }
    }

    private waitingForApplications = (): GroupViewMode => 'waitingForApplications'

    private waitingForPreview = (): GroupViewMode => 'waitingForPreview'

    private groupsPresent = (): GroupViewMode => 'groupsPresent'
}
