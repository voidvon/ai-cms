<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
 <!--#include file="../../../inc/filesystem.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<!--#include file="../kernel/temp_inc.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../spck/login.asp';</SCRIPT>" 
	response.end
end if
 

'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 if trim(ins)="010" then 
 ishavegant=true
 end if
 next 
 if ishavegant=false then
 response.redirect "../../../spck/err.asp"
 response.end
 end if
 
 '读取模板^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Set Rs=Server.CreateObject("ADODB.Recordset")
Rs.Open ("select produts_detail from benming_ch_worldec_Temp where selected=1"),conn,1,1
If Not Rs.Eof Then 
	templets=Rs("produts_detail")
	Rs.Close
	set Rs=nothing
End If

'取模板内容
Set fso =YXFSO
Set sort_save=fso.OpenTextFile(Server.MapPath(templets))  
Web_str=sort_save.ReadAll  
sort_save.close 		
		
'读取要生成的信息^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
If Request("page")<>"" Then
	If Cint(Request("page"))<1 Then
		currentPage=1
	Else
		currentPage=Cint(Request("page"))
	End If
Else        
	currentPage=1        
End If
	  
       '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		MaxPerPage=1
	  	id1=Replace(Request("id1"),"'","")
		id2=Replace(Request("id2"),"'","")
		If IsNumeric(id2)=false OR IsNumeric(id2)=false Then 
			Response.write "参数传递错误"
			Response.end
		End If
		Set Rsprod=Server.CreateObject("ADODB.Recordset")
		Rsprod.Open ("Select * from benming_ch_prod where id between "&id1&" and "&id2&""),conn,1,1
		if not Rsprod.eof then
			Rsprod.pagesize=MaxPerPage
			Rsprod.absolutepage=currentPage 
			If Not Rsprod.Eof Then
				mpage=Rsprod.pagecount 
				pageName=Rsprod("id")
				Hope_Prodid=Rsprod("id")
				Hope_CatID=Rsprod("Catid") 
				Hope_Random=Random(Rsprod("Catid") )

				HOPE_TITLE=Rsprod("prodName") '标题
				HOPE_IMG=Rsprod("smallpic")  '小图
				HOPE_BigIMG=Rsprod("bigpic")
				HOPE_ProdCode=Rsprod("prodCode") '型号
				HOPE_BODY=Rsprod("itemize") '产品详细介绍
				HOPE_remark=Rsprod("remark") '产品描述

				HOPE_prodKeywords=Rsprod("key") '关键字
				HOPE_prodDescription=Rsprod("remark")'描述
				
			Else
				Response.Write "<b>生成完毕</b>&nbsp;完成时间："&Now()&" <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
				Response.end
			End If
		else
			Response.Write "<b>没有数据</b>"
			Response.end
		end if
		 Rsprod.Close
		
		 Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&mpage&"</b></font>个 "
		 
		
		
		'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		pencat=Web_str
		pencat=Hope_HtmlResult(pencat)
		Set sort_save = fso.CreateTextFile(server.mappath("/Product/"&PageName&".html"))
		sort_save.Write pencat
		sort_save.Close
		Response.write "<meta http-equiv=Refresh content='0; URL=makedetail.asp?id1="&id1&"&id2="&id2&"&page="&currentPage+1&"'>"



Function GetCatName(id)
	SqlCat="Select CatName From benming_ch_ProdCat where id="&id
	Set RsCat=Server.CreateObject("ADODB.RecordSet")
	RsCat.open SqlCat,Conn,1,1
	if RsCat.bof=False and RsCat.eof=False then
		GetCatName=RsCat("CatName")
	end if
	RsCat.close
	Set RsCat=nothing
End Function

Function GetCatid(id)
	SqlCat="Select id,Root From benming_ch_ProdCat where id="&id
	Set RsCat=Server.CreateObject("ADODB.RecordSet")
	RsCat.open SqlCat,Conn,1,1
	if RsCat.bof=False and RsCat.eof=False then
		GetCatid=RsCat("Root")
	end if
	RsCat.close
	Set RsCat=nothing
End Function


Function Random(CatID)
	Dim Sql,strs,RandomI,strClass
	RandomI=0
	Sql="Select top 5 * from benming_ch_prod where Catid="&CatID&" ORDER BY Rnd(id)"
	Set Rs_Random=Server.CreateObject("ADODB.RecordSet")
	Rs_Random.open Sql,Conn,1,1
	strs="<table width=""100%"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
	strs=strs&"<tr>"
	Do while not Rs_Random.eof
		RandomI=RandomI+1
		if RandomI mod 5 <>0 then
			strClass="class=""in5"""
		else
			strClass=""
		end if 
		strs=strs&"<td width=""50%"" height=""90"" align=""center"" valign=""middle"" "&strClass&">"
		
		strs=strs&"<table width=""100%"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
        strs=strs&"<tr>"
        strs=strs&"<td width=""100%"" height=""47"" align=""center"" valign=""middle"" "&strClass&">"
		strs=strs&"<img src="""&Rs_Random("smallpic")&""" width=""120"" height=""90"" />"
		strs=strs&"</td>"
       	strs=strs&"</tr>"
        strs=strs&"<tr>"
        strs=strs&"<td align=""center"" height=""20"" >&nbsp;<a href="""&Rs_Random("id")&".html"" class=""Font_2E4690_a Font-Weight"">"&Rs_Random("prodName")&"</a></td>"
        strs=strs&"</tr>"
        strs=strs&"</table>"
		
		strs=strs&"</td>"
		if RandomI mod 5=0 then
			strs=strs&"</tr><tr>"
		end if
		Rs_Random.movenext	
	Loop
	Rs_Random.close
	Set Rs_Random=nothing
	strs=strs&"</tr>"
	strs=strs&"</table>"
	Random=strs
End Function



%>