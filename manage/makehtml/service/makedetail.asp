<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
 <!--#include file="../../../inc/filesystem.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<!--#include file="../kernel/temp_inc.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../../admin/login.asp';</SCRIPT>" 
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
 response.redirect "../../../admin/err.asp"
 response.end
 end if
 '读取模板^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 Set Rs=Server.CreateObject("ADODB.Recordset")
 Rs.Open ("select service_detail from benming_ch_worldec_Temp where selected=1"),conn,1,1
 If Not Rs.Eof Then 
 	templets=Rs("service_detail")
	Rs.Close
	Set Rs=nothing
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
		Set RsNews=Server.CreateObject("ADODB.Recordset")
		RsNews.Open ("Select * from benming_ch_news where Typeid in("&Getid(12) &") and newsid between "&id1&" and "&id2&""),conn,1,1
		if not RsNews.eof then
			RsNews.pagesize=MaxPerPage
			RsNews.absolutepage=currentPage 
			If Not RsNews.Eof Then
				
				mpage=RsNews.pagecount 
				pageName=RsNews("newsid") 
				Hope_TypeID=RsNews("Typeid")
				Hope_Catname=GetNewstype(RsNews("Typeid"))
				HOPE_TITLE=RsNews("Title")
				
				HOPE_NewsKeywords=RsNews("key")
				HOPE_NewsDescription=RsNews("desc")
				
				Hope_body=RsNews("Content")
     
				'上一条标题
				Sql="SELECT TOP 1 * FROM benming_ch_news where Typeid="&RsNews("typeid")&" and newsid<"&RsNews("Newsid")&" order by newsid desc"
				
				Set Rs_Previous=Server.CreateObject("ADODB.RecordSet")
				Rs_Previous.open Sql,Conn,1,1
				if Rs_Previous.bof=False and Rs_Previous.eof=False then
					Hope_Previous="<a href="""&Rs_Previous("newsid")&".html"" class=""Font_2e4690_a "">"&Rs_Previous("Title")&"</a>"
				else
					Hope_Previous="<span class=""Font_2e4690_a"">没有数据了</span>"
				end if
				Rs_Previous.close
				Set Rs_Previous=nothing
				
				'下一条标题
				Sql="SELECT TOP 1 * FROM benming_ch_news where Typeid="&RsNews("typeid")&" and newsid>"&RsNews("Newsid")&" order by newsid asc"
				Set Rs_Next=Server.CreateObject("ADODB.RecordSet")
				Rs_Next.open Sql,Conn,1,1
				if Rs_Next.bof=False and Rs_Next.eof=False then
					Hope_Next="<a href="""&Rs_Next("newsid")&".html"" class=""Font_2e4690_a "">"&Rs_Next("Title")&"</a>"
				else
					Hope_Next="<span class=""Font_2e4690_a"">没有数据了</span>"
				end if
				Rs_Next.close
				Set Rs_Next=nothing
			 Else
				 	Response.Write "<b>生成完毕</b>&nbsp;完成时间："&Now()&" <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
					Response.end
			 End If
		else
			Response.Write "<b>没有数据</b> <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
			Response.end
		end if
		 RsNews.Close
		 Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&mpage&"</b></font>个"
		 
		 
		 
		'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		pencat=Web_str
		pencat=Hope_HtmlResult(pencat)
				
		'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
		Set sort_save = fso.CreateTextFile(server.mappath("/service/detail/"&pageName&".html"))
		sort_save.Write pencat
		sort_save.Close
		Response.write "<meta http-equiv=Refresh content='0; URL=makedetail.asp?id1="&id1&"&id2="&id2&"&page="&currentPage+1&"'>"

'^^^^^^^服务所有小类ID
Function Getid(id) 
	strid=id
 	Sqlid="Select * from benming_ch_NewsCat where Root="&id
	Set Rsid=Server.CreateObject("ADODB.RecordSet")
	Rsid.open Sqlid,Conn,1,1
	do while not Rsid.eof
		strid=strid&","&Rsid("id")
		Rsid.movenext
	loop
	Rsid.close
	Set Rsid=nothing
	Getid=strid
End Function

Function GetNewstype(id)
	Set RsNewstype=Server.CreateObject("ADODB.RecordSet")
	RsNewstype.open "Select CatName from benming_ch_NewsCat where id="&id&"",Conn,1,1
	if Rsnewstype.eof=false and RsNewstype.bof=false then
		GetNewstype=Rsnewstype("CatName")
	end if
	RsNewstype.close
	set RsNewstype=nothing
End function


%>