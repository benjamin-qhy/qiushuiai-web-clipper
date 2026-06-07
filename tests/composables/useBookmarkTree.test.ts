import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBookmarkTree } from '../../src/composables/useBookmarkTree'

const { bookmarksCreate, bookmarksGetChildren, bookmarksGetSubTree, bookmarksGetTree, recordsGetAll } = vi.hoisted(() => ({
  bookmarksCreate: vi.fn(),
  bookmarksGetChildren: vi.fn(),
  bookmarksGetSubTree: vi.fn(),
  bookmarksGetTree: vi.fn(),
  recordsGetAll: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    bookmarks: {
      create: bookmarksCreate,
      getChildren: bookmarksGetChildren,
      getSubTree: bookmarksGetSubTree,
      getTree: bookmarksGetTree,
    },
  },
}))

vi.mock('../../src/storage/bookmarks', () => ({
  getAllBookmarkRecords: recordsGetAll,
}))

beforeEach(() => {
  bookmarksCreate.mockReset()
  bookmarksGetChildren.mockReset()
  bookmarksGetSubTree.mockReset()
  bookmarksGetTree.mockReset()
  recordsGetAll.mockReset()

  bookmarksGetTree.mockResolvedValue([{ id: '0', title: '', children: [] }])
  recordsGetAll.mockResolvedValue([])
})

describe('useBookmarkTree.selectFolder', () => {
  it('selects bookmarks from the full folder subtree', async () => {
    bookmarksGetTree.mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: '书签栏',
            children: [
              { id: '2', parentId: '1', title: 'Root bookmark', url: 'https://root.example' },
              {
                id: '3',
                parentId: '1',
                title: '工具',
                children: [
                  { id: '4', parentId: '3', title: 'Nested bookmark', url: 'https://nested.example' },
                ],
              },
            ],
          },
        ],
      },
    ])

    bookmarksGetSubTree.mockResolvedValue([
      {
        id: '1',
        title: '书签栏',
        children: [
          { id: '2', parentId: '1', title: 'Root bookmark', url: 'https://root.example' },
          {
            id: '3',
            parentId: '1',
            title: '工具',
            children: [
              { id: '4', parentId: '3', title: 'Nested bookmark', url: 'https://nested.example' },
            ],
          },
        ],
      },
    ])

    const tree = useBookmarkTree()
    await tree.loadTree()
    await tree.selectFolder('1')

    expect(tree.selectedBookmarks.value.map(b => b.id)).toEqual(['2', '4'])
    expect(tree.selectedBookmarks.value.map(b => b.folderPath)).toEqual(['', '工具'])
    expect(tree.selectedFolderStats.value).toEqual({
      directBookmarkCount: 1,
      recursiveBookmarkCount: 2,
      childFolderCount: 1,
    })
  })
})

describe('useBookmarkTree.createFolder', () => {
  it('does not create a duplicate folder with the same parent and title', async () => {
    bookmarksGetChildren.mockResolvedValue([{ id: '2', parentId: '1', title: '阅读', children: [] }])

    const tree = useBookmarkTree()
    await tree.createFolder('1', '阅读')

    expect(bookmarksCreate).not.toHaveBeenCalled()
  })

  it('coalesces concurrent create requests for the same parent and title', async () => {
    bookmarksGetChildren.mockResolvedValue([])
    bookmarksCreate.mockResolvedValue({ id: '2', parentId: '1', title: '阅读' })

    const tree = useBookmarkTree()
    await Promise.all([
      tree.createFolder('1', '阅读'),
      tree.createFolder('1', '阅读'),
    ])

    expect(bookmarksCreate).toHaveBeenCalledTimes(1)
    expect(bookmarksCreate).toHaveBeenCalledWith({ parentId: '1', title: '阅读' })
  })
})
