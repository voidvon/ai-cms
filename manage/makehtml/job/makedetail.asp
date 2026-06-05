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
 Rs.Open ("select Job_detail from benming_ch_worldec_Temp where selected=1"),conn,1,1
 If Not Rs.Eof Then 
 	templets=Rs("Job_detail")
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
		Set Rsjob=Server.CreateObject("ADODB.Recordset")
		Rsjob.Open ("Select * from benming_ch_job where state=1 and id between "&id1&" and "&id2&""),conn,1,1
		if not Rsjob.eof then
			Rsjob.pagesize=MaxPerPage
			Rsjob.absolutepage=currentPage 
			If Not Rsjob.Eof Then
				
				mpage=Rsjob.pagecount 
				pageName=Rsjob("id") 
				
				Hope_TITLE=Rsjob("jobName") '职位名称
				Hope_address=Rsjob("address") '招聘地址
				Hope_jobnob=Rsjob("jobnob") '人数
				Hope_jobneed=Rsjob("jobneed") '要求
				Hope_linkren=Rsjob("linkren") '联系人
				Hope_phone=Rsjob("phone") '联系电话
				Hope_date=Rsjob("date") '发布日期
     
				
			
			
			 Else
				 	Response.Write "<b>生成完毕</b>&nbsp;完成时间："&Now()&" <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
					Response.end
			 End If
		else
			Response.Write "<b>没有数据</b> <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
			Response.end
		end if
		 Rsjob.Close
		 Set Rsjob=nothing
		 Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&mpage&"</b></font>个"
		 
		 
		 
		'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		pencat=Web_str
		pencat=Hope_HtmlResult(pencat)
				
		'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	
		Set sort_save = fso.CreateTextFile(server.mappath("/Job/detail/"&pageName&".html"))
		sort_save.Write pencat
		sort_save.Close
		Response.write "<meta http-equiv=Refresh content='0; URL=makedetail.asp?id1="&id1&"&id2="&id2&"&page="&currentPage+1&"'>"

%>