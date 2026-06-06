# CSV Import Notes

把旧 Access 数据导出为 CSV 后放到这个目录，再运行：

```bash
npm run db:import
```

推荐导出的文件名：

- `benming_master.csv`
- `benming_ch_ProdCat.csv`
- `benming_ch_prod.csv`
- `benming_ch_prodphoto.csv`
- `benming_ch_NewsCat.csv`
- `benming_ch_news.csv`
- `benming_ch_job.csv`
- `benming_ch_Msg.csv`
- `benming_ch_Contact.csv`
- `benming_ch_Cocat.csv`
- `benming_ch_MetaType.csv`
- `benming_ch_config.csv`
- `benming_ch_worldec_Temp.csv`
- `benming_ch_cuskind.csv`
- `benming_ch_cuslabel.csv`

如果导出的 CSV 是 GBK/GB2312 编码：

```bash
CSV_ENCODING=gbk npm run db:import
```

未识别的字段不会直接丢弃，会被写入各表的 `legacy_extra` JSON 字段，方便后续补迁移逻辑。
