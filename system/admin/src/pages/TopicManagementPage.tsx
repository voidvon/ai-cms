import ContentModelDataPage from '@/pages/ContentModelDataPage'

export default function TopicManagementPage() {
  return (
    <ContentModelDataPage
      initialModelCode="topic"
      lockModelSelection
      pageTitle="专题管理"
      pageDescription="管理专题栏目绑定的专题内容、关键词、SEO 信息和关联内容。"
      createButtonLabel="新增专题"
    />
  )
}
