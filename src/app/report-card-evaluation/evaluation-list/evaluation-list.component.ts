import {Component, Input, OnDestroy, OnInit} from '@angular/core'
import {TableHeaderColumn} from '../../abstract-crud/abstract-crud.component'
import {Observable, Subscription} from 'rxjs'
import {ReportCardEvaluationAtom} from '../../models/report-card-evaluation'
import {ReportCardEvaluationService} from '../../services/report-card-evaluation.service'
import {format} from '../../utils/lwmdate-adapter'
import {map, tap} from 'rxjs/operators'
import {LoadingService, withSpinning} from '../../services/loading.service'
import {groupBy, mapMap} from '../../utils/group-by'
import {count, isEmpty, maxBy, subscribe} from '../../utils/functions'
import {LWMColor} from '../../utils/colors'
import {initiateDownloadWithDefaultFilenameSuffix} from '../../xls-download/xls-download'
import {ActionType} from '../../abstract-header/abstract-header.component'
import {ReportCardEntryService} from '../../services/report-card-entry.service'
import {LabworkAtom} from '../../models/labwork.model'

interface Eval {
    firstName: string,
    lastName: string,
    systemId: string,
    studentId: string,
    passed: boolean,
    lastModified: Date
}

interface Summary {
    text: string,
    color: LWMColor
}

@Component({
    selector: 'lwm-evaluation-list',
    templateUrl: './evaluation-list.component.html',
    styleUrls: ['./evaluation-list.component.scss']
})
export class EvaluationListComponent implements OnInit, OnDestroy {

    private static readonly evalLabel = 'Evaluieren'

    private static readonly pssoLabel = 'Prüfungsleistungen (PSSO) herunterladen'

    private static readonly detailReportCardsLabel = 'Detailierte Praktikumsleistungen herunterladen'

    @Input() labwork: LabworkAtom

    @Input() hasPermission: boolean
    columns: TableHeaderColumn[]
    tableContent: (model: Readonly<Eval>, attr: string) => string
    filterPredicate: (data: Eval, filter: string) => boolean

    sortingDataAccessor: (data: Eval, property: string) => number
    summary: Summary[]
    evals$: Observable<Eval[]>

    private subs: Subscription[] = []

    constructor(
        private readonly evalService: ReportCardEvaluationService,
        private readonly reportCardService: ReportCardEntryService,
        private readonly loadingService: LoadingService,
    ) {
        this.summary = []
        this.columns = [
            {title: 'GMID', attr: 'systemId'},
            {title: 'Nachname', attr: 'lastName'},
            {title: 'Vorname', attr: 'firstName'},
            {title: 'Bestanden', attr: 'passed'},
            {title: 'Datum', attr: 'lastModified'}
        ]
        this.tableContent = (e, attr) => {
            switch (attr) {
                case 'passed':
                    return e.passed ? 'Ja' : 'Nein'
                case 'lastModified':
                    return format(e.lastModified, 'dd.MM.yyyy - HH:mm')
                default:
                    return e[attr]
            }
        }
        this.filterPredicate = (e, filter) =>
            e.systemId.toLowerCase().includes(filter) ||
            e.firstName.toLowerCase().includes(filter) ||
            e.lastName.toLowerCase().includes(filter) ||
            (e.passed ? 'Ja' : 'Nein').toLowerCase().includes(filter) ||
            format(e.lastModified, 'dd.MM.yyyy - HH:mm').includes(filter)
        this.sortingDataAccessor = (data, property) => {
            switch (property) {
                case 'date':
                    return new Date(data.lastModified)
                default:
                    return data[property]
            }
        }
    }

    ngOnInit(): void {
        this.evals$ = this.toEval(this.evalService.getAll(this.courseId(), this.labworkId()))
    }

    private labworkId = () =>
        this.labwork.id

    private courseId = () =>
        this.labwork.course.id

    ngOnDestroy() {
        this.subs.forEach(_ => _.unsubscribe())
    }

    actions = (): ActionType[] =>
        this.hasPermission ?
            [
                {type: 'evaluate', label: EvaluationListComponent.evalLabel},
                {type: 'download', label: EvaluationListComponent.pssoLabel},
                {type: 'download', label: EvaluationListComponent.detailReportCardsLabel},
            ] :
            []

    onAction = (action: ActionType) => {
        switch (action.type) {
            case 'evaluate':
                this.evaluate()
                break
            case 'download':
                switch (action.label) {
                    case EvaluationListComponent.pssoLabel:
                        this.downloadGraduates()
                        break
                    case EvaluationListComponent.detailReportCardsLabel:
                        this.downloadReportCardStats()
                        break
                    default:
                        break
                }
                break
            default:
                break
        }
    }

    onDelete = (e: Readonly<Eval>) => e

    onEdit = (e: Readonly<Eval>) => e

    private downloadGraduates = () => {
        const s = subscribe(this.evalService.download(this.courseId(), this.labworkId()), blob => {
            initiateDownloadWithDefaultFilenameSuffix('Absolventen', this.labwork, blob)
        })

        this.subs.push(s)
    }

    private downloadReportCardStats = () => {
        const s = subscribe(this.reportCardService.download(this.courseId(), this.labworkId()), blob => {
            initiateDownloadWithDefaultFilenameSuffix('Notenhefte', this.labwork, blob)
        })

        this.subs.push(s)
    }

    private evaluate = () =>
        this.evals$ = withSpinning<Eval[]>(this.loadingService)(this.toEval(this.evalService.create(this.courseId(), this.labworkId())))

    private toEval = (evals$: Observable<ReportCardEvaluationAtom[]>): Observable<Eval[]> => {
        const updateStats = (evals: Eval[]) => {
            if (isEmpty(evals)) {
                return
            }

            const formatPercent = (n: number) => (n * 100).toFixed(2)

            const attendees = evals.length
            const passed = count(evals, _ => _.passed)
            const failed = attendees - passed
            const passedPercent = passed / attendees
            const failedPercent = 1.0 - passedPercent

            this.summary = [
                {color: 'primary', text: `Teilnehmer ${attendees}`},
                {color: 'primary', text: `Bestanden ${passed} (${formatPercent(passedPercent)} %)`},
                {color: 'primary', text: `Durchgefallen ${failed} (${formatPercent(failedPercent)} %)`},
            ]
        }

        const go = (evals: Readonly<ReportCardEvaluationAtom[]>): Eval[] => mapMap(
            groupBy([...evals], _ => _.student.id),
            (_, xs) => {
                const first = xs[0]
                const passed = xs.reduce((acc, x) => acc && x.bool, true)
                // tslint:disable-next-line:no-non-null-assertion
                const latest = maxBy(xs, (lhs, rhs) => lhs.lastModified.getTime() > rhs.lastModified.getTime())!!.lastModified

                return {
                    firstName: first.student.firstname,
                    lastName: first.student.lastname,
                    systemId: first.student.systemId,
                    studentId: first.student.id,
                    passed: passed,
                    lastModified: latest
                }
            })

        return evals$.pipe(map(go), tap(updateStats))
    }
}
