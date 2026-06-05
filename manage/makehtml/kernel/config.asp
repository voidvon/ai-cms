<%
wet_path=2 '2=skin下面的文件夹名
sql="select * from benming_ch_config where id=1"
set rsconfig=server.createobject("adodb.recordset")
rsconfig.open sql,conn,1,1
if rsconfig.eof=false and rsconfig.bof=false then
	webname=rsconfig("webname")      '网站名称        #hope_webname#
	weburl=rsconfig("weburl")        '网站地址          #hope_weburl#
	
	coname=rsconfig("coname")        '公司名称
	coadd=rsconfig("coadd")          '公司地址
	post =rsconfig("copost")         '公司联系邮政编码  #hope_post#
	
	systemtel=rsconfig("cophone")    '网站联系电话      #hope_tel#
	hotfax=rsconfig("cofax")         '网站联系传真      #hope_fax#
	address =rsconfig("coadd")       '公司联系地址      #hope_address#
	ren=rsconfig("coren")            '联系人
	
	systememail=rsconfig("coemail")  '网站联系邮箱      #hope_email#     
	icp="<a href=""http://www.miibeian.gov.cn"" target=""_blank"" class=""font_ffffff_a"">"&rsconfig("webicp")&"</a>"          '备案

	
	webqq=rsconfig("webqq")           'qq
	webmsn=rsconfig("webmsn")         'msn
	
	webauthor=rsconfig("webauthor")   '网站作者
	webcopyright=rsconfig("webcopyright") '版权
	benming="<a href=""http://idc.59599.cn/"" target=""_blank"" class=""font_ffffff_a"">"&rsconfig("benming")&"</a>"
	
end if
rsconfig.close
set rsconfig=nothing

%>