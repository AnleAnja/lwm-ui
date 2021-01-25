import {Component, Input, OnDestroy, OnInit} from '@angular/core'
import {ReportCardEntryAtom} from '../models/report-card-entry.model'
import {MatDialog, MatTableDataSource} from '@angular/material'
import {TableHeaderColumn} from '../abstract-crud/abstract-crud.component'
import {AuthorityAtom} from '../models/authority.model'
import {hasAnyRole} from '../utils/role-checker'
import {UserRole} from '../models/role.model'
import {openDialog} from '../shared-dialogs/dialog-open-combinator'
import {RescheduleComponent} from '../reschedule/reschedule.component'
import {of, Subscription} from 'rxjs'
import {subscribe} from '../utils/functions'
import {ReportCardRescheduledAtom} from '../models/report-card-rescheduled.model'
import {updateDataSource} from '../shared-dialogs/dataSource.update'
import {AlertService} from '../services/alert.service'
import {AnnotationComponent} from '../annotation/annotation.component'

// ReportCard Model

export interface ReportCardTableEntry {
    entry: ReportCardEntryAtom
    annotationCount: number
}

export interface ReportCardTableModel {
    dataSource: MatTableDataSource<ReportCardTableEntry>,
    columns: TableHeaderColumn[]
}

// Reschedule Model

export interface RescheduleViewStrategy {
    kind: 'view'
    attrsAffectedByReschedule: string[]
    rescheduleReasonAttr: string
    indexAttr: string
    rescheduledContentFor: (e: Readonly<ReportCardRescheduledAtom>, attr: string) => string
}

export interface RescheduleFromIntoStrategy {
    kind: 'from_into'
    indexAttr: string
    isInto: (e: Readonly<ReportCardEntryAtom>) => boolean
}

export type ReschedulePresentationStrategy = RescheduleViewStrategy | RescheduleFromIntoStrategy

@Component({
    selector: 'lwm-report-card-table',
    templateUrl: './report-card-table.component.html',
    styleUrls: ['./report-card-table.component.scss']
})
export class ReportCardTableComponent implements OnInit, OnDestroy {

    // Permissions
    @Input() auths: Readonly<AuthorityAtom[]>
    @Input() allowRescheduling: boolean
    @Input() allowAnnotations: boolean
    canReschedule: boolean
    canAnnotate: boolean
    canApprove: boolean

    // Reschedule Strategy
    @Input() reschedulePresentationStrategy: ReschedulePresentationStrategy

    // Content
    @Input() tableModel: ReportCardTableModel
    @Input() tableContentFor: (e: Readonly<ReportCardEntryAtom>, attr: string) => string
    displayedColumns: string []

    private subs: Subscription[]

    constructor(
        private readonly dialog: MatDialog,
        private readonly alertService: AlertService
    ) {
        this.displayedColumns = []
        this.subs = []
        this.tableContentFor = (e, attr) => e[attr]
        this.allowRescheduling = false
        this.allowAnnotations = false
    }

    ngOnInit() {
        console.assert(this.reschedulePresentationStrategy !== undefined)

        this.canReschedule = this.allowRescheduling && this.hasReschedulePermission(this.auths)
        this.canAnnotate = this.allowAnnotations && this.hasAnnotationPermission(this.auths)
        this.canApprove = this.hasApprovalPermission(this.auths)

        const c = this.tableModel.columns.map(_ => _.attr)

        if (this.canReschedule || this.canAnnotate) {
            c.push('action')
        }

        this.displayedColumns = c
    }

    ngOnDestroy(): void {
        this.subs.forEach(_ => _.unsubscribe())
    }

    // permission checks

    private hasReschedulePermission = (auths: Readonly<AuthorityAtom[]>) =>
        hasAnyRole(auths, UserRole.courseEmployee, UserRole.courseManager, UserRole.admin)

    private hasAnnotationPermission = (auths: Readonly<AuthorityAtom[]>) =>
        hasAnyRole(auths, UserRole.courseAssistant, UserRole.courseEmployee, UserRole.courseManager, UserRole.admin)

    private hasApprovalPermission = (auths: Readonly<AuthorityAtom[]>) =>
        hasAnyRole(auths, UserRole.courseAssistant, UserRole.courseEmployee, UserRole.courseManager, UserRole.admin)

    // reschedule dialog

    openRescheduleDialog = (e: ReportCardTableEntry) => {
        const updateTable = (entry: ReportCardEntryAtom) => {
            const update = updateDataSource(this.tableModel.dataSource, this.alertService)
            update(
                {...e, entry: entry},
                (lhs, rhs) => lhs.entry.id === rhs.entry.id
            )
        }

        this.subs.push(subscribe(
            openDialog(RescheduleComponent.instance(this.dialog, e.entry), of),
            updateTable
        ))
    }

    // annotation dialog

    openAnnotationDialog = (e: ReportCardEntryAtom) => {
        this.subs.push(subscribe(
            openDialog(AnnotationComponent.instance(this.dialog, e, this.auths[0].user), of),
            console.log
        ))
    }

    // decisions whether the current user can see reschedules or not

    // a report card entry can only be rescheduled once by now. add support for multiple reschedules later on
    canPerformRescheduleAction = (e: ReportCardEntryAtom) =>
        this.canReschedule && e.rescheduled === undefined

    isRescheduled = (e: ReportCardEntryAtom) =>
        e.rescheduled !== undefined

    isAffectedByRescheduled = (s: RescheduleViewStrategy, attr: string): boolean =>
        s.attrsAffectedByReschedule.includes(attr)

    isInto = (e: ReportCardEntryAtom): boolean =>
        this.reschedulePresentationStrategy.kind === 'from_into' && this.reschedulePresentationStrategy.isInto(e)

    canSeeApprovals = (e: ReportCardEntryAtom): boolean =>
        this.isInto(e) || // is either rescheduled into an schedule entry
        this.reschedulePresentationStrategy.kind === 'view' || // or presented in report card entry view
        !this.isRescheduled(e) // or is presented as a normal member within a schedule entry

    // annotation badge handling
}
