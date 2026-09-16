import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, type Layout, useGroupRef } from 'react-resizable-panels'
import { FileText, Images, PenLine, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import { ButtonGroup } from './ui/button-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  DEFAULT_PUBLISHER_LAYOUT,
  type PublisherLayout,
  type WorkbenchPaneId,
} from '../types'

const paneIds: WorkbenchPaneId[] = ['source', 'composer', 'output']
const paneLabels: Record<WorkbenchPaneId, string> = { source: '原文', composer: '创作', output: '成品' }

interface ResponsiveWorkspaceProps {
  header?: ReactNode
  layout: PublisherLayout
  onLayoutChange(layout: PublisherLayout): void
  panes: Record<WorkbenchPaneId, ReactNode>
}

export function ResponsiveWorkspace({ header, layout, onLayoutChange, panes }: ResponsiveWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const groupRef = useGroupRef()
  const [width, setWidth] = useState(1200)

  useEffect(() => {
    const element = rootRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const visibleIds = paneIds.filter(id => layout.visible[id])
  const mode = width < 700 ? 'narrow' : width < 1100 ? 'medium' : 'wide'
  const renderedIds = (() => {
    if (mode !== 'medium' || visibleIds.length <= 2) return visibleIds
    const activeIndex = Math.max(0, visibleIds.indexOf(layout.activePane))
    return activeIndex >= visibleIds.length - 1
      ? visibleIds.slice(-2)
      : visibleIds.slice(activeIndex, activeIndex + 2)
  })()

  function selectPane(activePane: WorkbenchPaneId) {
    onLayoutChange({ ...layout, activePane })
  }

  function togglePane(id: WorkbenchPaneId) {
    const nextVisible = { ...layout.visible, [id]: !layout.visible[id] }
    if (!Object.values(nextVisible).some(Boolean)) return
    const activePane = nextVisible[layout.activePane]
      ? layout.activePane
      : paneIds.find(paneId => nextVisible[paneId])!
    onLayoutChange({ ...layout, visible: nextVisible, activePane })
  }

  function savePanelSizes(next: Layout) {
    const sizes = applyPanelLayout(layout.sizes, renderedIds, next)
    if (sizes.some((size, index) => Math.abs(size - layout.sizes[index]) > 0.01)) {
      onLayoutChange({ ...layout, sizes })
    }
  }

  const defaultLayout = Object.fromEntries(renderedIds.map(id => [id, layout.sizes[paneIds.indexOf(id)]]))
  const panelGroupId = `${mode}-${renderedIds.join('-')}`

  useEffect(() => {
    if (mode !== 'narrow') groupRef.current?.setLayout(defaultLayout)
  }, [groupRef, layout.sizes, mode, panelGroupId])

  const paneIcons = { source: FileText, composer: PenLine, output: Images }

  return <div ref={rootRef} className="publishing-workbench__workspace" data-layout-mode={mode}>
    <div className="publishing-workbench__topbar">
      {header}
      <div className="publishing-workbench__topbar-actions">
        {mode === 'medium' && <ButtonGroup className="publishing-workbench__pane-switcher" aria-label="选择主要区域">
          {visibleIds.map(id => {
            const Icon = paneIcons[id]
            return <Button
              key={id}
              size="icon-sm"
              variant={layout.activePane === id ? 'default' : 'outline'}
              aria-label={`切换到${paneLabels[id]}`}
              aria-pressed={layout.activePane === id}
              title={`切换到${paneLabels[id]}`}
              onClick={() => selectPane(id)}
            ><Icon aria-hidden="true" /></Button>
          })}
        </ButtonGroup>}
        <ButtonGroup className="publishing-workbench__layout-toolbar" aria-label="区域显示设置">
          {paneIds.map(id => {
            const Icon = paneIcons[id]
            const label = layout.visible[id] ? `隐藏${paneLabels[id]}` : `显示${paneLabels[id]}`
            return <Button
              key={id}
              size="icon-sm"
              variant={layout.visible[id] ? 'secondary' : 'outline'}
              disabled={layout.visible[id] && visibleIds.length === 1}
              aria-label={label}
              aria-pressed={layout.visible[id]}
              title={label}
              onClick={() => togglePane(id)}
            ><Icon aria-hidden="true" /></Button>
          })}
          <Button size="icon-sm" variant="outline" aria-label="重置布局" title="重置布局"
            onClick={() => onLayoutChange(structuredClone(DEFAULT_PUBLISHER_LAYOUT))}>
            <RotateCcw aria-hidden="true" />
          </Button>
        </ButtonGroup>
      </div>
    </div>

    {mode === 'narrow' ? <Tabs value={layout.activePane} onValueChange={value => selectPane(value as WorkbenchPaneId)}>
      <TabsList className="publishing-workbench__mobile-tabs">
        {visibleIds.map(id => <TabsTrigger key={id} value={id}>{paneLabels[id]}</TabsTrigger>)}
      </TabsList>
      {visibleIds.map(id => <TabsContent key={id} value={id}>{panes[id]}</TabsContent>)}
    </Tabs> : <Group
      key={panelGroupId}
      id={`publishing-workbench-panels-${panelGroupId}`}
      groupRef={groupRef}
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={savePanelSizes}
      className="publishing-workbench__panel-group"
    >
      {renderedIds.map((id, index) => <FragmentWithSeparator key={id} first={index === 0} id={id}>
        {panes[id]}
      </FragmentWithSeparator>)}
    </Group>}
  </div>
}

export function applyPanelLayout(
  currentSizes: PublisherLayout['sizes'],
  displayedIds: WorkbenchPaneId[],
  next: Layout,
): PublisherLayout['sizes'] {
  const displayedWeight = displayedIds.reduce((total, id) => total + currentSizes[paneIds.indexOf(id)], 0)
  const sizes = [...currentSizes] as PublisherLayout['sizes']
  displayedIds.forEach(id => {
    sizes[paneIds.indexOf(id)] = (next[id] ?? 0) / 100 * displayedWeight
  })
  return sizes
}

function FragmentWithSeparator({ first, id, children }: {
  first: boolean
  id: WorkbenchPaneId
  children: ReactNode
}) {
  return <>
    {!first && <Separator className="publishing-workbench__resize-handle" aria-label={`调整${paneLabels[id]}区域宽度`} />}
    <Panel id={id} minSize="20%" className="publishing-workbench__responsive-panel">{children}</Panel>
  </>
}
