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
Rs.Open ("select Co_index from benming_ch_worldec_Temp where selected=1"),conn,1,1
If Not Rs.Eof Then 
	pencat=Rs("Co_index")
	Rs.Close
	Set Rs=nothing
End If

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

		'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^开始生成html页面
		id=32
		MaxPerPage=1
		Sql="Select * from benming_ch_Cocat where root="&id&" and sitepath=0 order by OrderID"
		Set Rstype=Server.CreateObject("ADODB.RecordSet")
		Rstype.open Sql,Conn,1,1
		Rstype.pagesize=MaxPerPage
		Rstype.absolutepage=currentpage 
		Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&Rstype.pagecount&"</b></font>个 <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
		if Rstype.eof=False and Rstype.bof=False then
			PageName="About-"&Rstype("id")
			HOPE_Title=Rstype("coname")
			HOPE_Co_Centern=Rstype("Centern")
			'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			
			Set fso =YXFSO
			'取模板内容
			Set sort_save=fso.OpenTextFile(Server.MapPath(pencat))  
			Web_str=sort_save.ReadAll  
			sort_save.close 
			
			pencat=Hope_HtmlResult(Web_str)
			
			if currentPage=1 then
				Set sort_save = fso.CreateTextFile(server.mappath("/about/index.html"))
				sort_save.Write pencat
				sort_save.Close
			end if
			
			'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			Set sort_save = fso.CreateTextFile(server.mappath("/about/"&pageName&".html"))
			sort_save.Write pencat
			sort_save.Close
		else
			Response.end()
		end if
		Rstype.close
		Set Rstype=nothing
		conn.close
		Set conn=nothing
		Response.write "<meta http-equiv=Refresh content='0; URL=maketrade.asp?page="&currentPage+1&"'>"
       '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   
%>