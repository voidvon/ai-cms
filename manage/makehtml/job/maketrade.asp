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

'读取模板路径^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Set Rs=Server.CreateObject("ADODB.Recordset")
Rs.Open ("select job_index from benming_ch_worldec_Temp where selected=1"),conn,1,1
If Not Rs.Eof Then 
	templets=Rs("job_index")
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

	  
		'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^开始生成html页面
				msg_per_page=8 '一页12条记录
				Sql="Select * from benming_ch_job where state=1"
				Set RsjobCount=Server.CreateObject("ADODB.RecordSet")
				RsjobCount.open Sql,Conn,1,1
				mpage2=0
				If not RsjobCount.Eof Then
					totalrec=RsjobCount.RecordCount    '总记录条数
					RsjobCount.Pagesize=msg_per_page   '每页数
					mpage2=RsjobCount.Pagecount        '总页数
				End If
	
				Response.write "<br><b>已生成/要生成的页面条数:<font color=#FF0000>"&currentPage-1&"</font>/<font color=#FF0000><b>"&mpage2&"</b></font>个 <a href='#' onClick='javascript:history.back(-1);'>返回</a>"
				
				if mpage2>=1 then
					if currentPage-1=mpage2 then
						response.End()
					end if
					pageName=currentPage
					if currentPage=1 then
						tempsum=1
					else
						tempsum=(currentPage-1)*msg_per_page+1
					end if
					Hope_body=""
					SqljobCount2="SELECT TOP "&msg_per_page&" * FROM benming_ch_job WHERE state=1 and (id <= (SELECT min(id) FROM (SELECT TOP "&tempsum&" id FROM benming_ch_job where state=1 ORDER BY id desc) AS T)) ORDER BY id desc"
				
					Set RsjobCount2=Server.CreateObject("ADODB.RecordSet")
					RsjobCount2.open SqljobCount2,Conn,1,1
					Hope_body=Hope_body&"<table width=""100%"" border=""1"" cellpadding=""0"" cellspacing=""0"" bordercolor=""#CCCCCC"">"
					do while not RsjobCount2.eof
						Hope_body=Hope_body&"<tr>"
						Hope_body=Hope_body&"<td width=""59%"" height=""30"">&nbsp;&nbsp;·&nbsp;&nbsp;<a href=""detail/"&RsjobCount2("id")&".html"" class=""Font_000000_B_a"">"&RsjobCount2("jobName")&"</a></td>"
						Hope_body=Hope_body&"<td width=""13%"" align=""center"">"&RsjobCount2("jobnob")&"</td>"
						Hope_body=Hope_body&"<td width=""18%"" align=""center"">"&RsjobCount2("address")&"</td>"
						Hope_body=Hope_body&"<td width=""10%"" align=""center"">"&RsjobCount2("date")&"</td>"
						Hope_body=Hope_body&"</tr>"
						RsjobCount2.movenext
					loop 	
					RsjobCount2.close
					Set RsjobCount2=nothing
					Hope_body=Hope_body&"</table>"
					'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分页条strar
					Hope_body=Hope_body&"<table width=""100%"" border=""0"" cellpadding=""0"" cellspacing=""0"">"
					Hope_body=Hope_body&"<tr>"
					Hope_body=Hope_body&"<td height=""50"" align=""center"">共 "&totalrec&" 条信息"
					Hope_body=Hope_body&" <a href=""1.html "" class=""Font_000000_a"">首页</a>"
					if currentPage-1<1 then
						Hope_body=Hope_body&" <span class=""Font_000000_a"">上一页</span>"
					else
						Hope_body=Hope_body&" <a href="""&(currentPage-1)&".html "" class=""Font_000000_a"">上一页</a>"
					end if
					if currentPage+1>mpage2 then
						Hope_body=Hope_body&" <span class=""Font_000000_a"">下一页</span>"
					else
						Hope_body=Hope_body&" <a href="""&(currentPage+1)&".html "" class=""Font_000000_a"">下一页</a>"
					end if
					
					Hope_body=Hope_body&" <a href="""&mpage2&".html "" class=""Font_000000_a"">尾页</a> "
					Hope_body=Hope_body&" 页次： "&currentPage&"/"&mpage2&" 页 "&msg_per_page&"条信息/页</td>"
					Hope_body=Hope_body&"</tr>"
					Hope_body=Hope_body&"</table>"
					'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分页条end
					pencat=Web_str
					pencat=Hope_HtmlResult(pencat)
							
							
					'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
					if currentPage=1 then
						set sort_save = fso.CreateTextFile(server.mappath("/Job/index.html"))
						sort_save.Write pencat
						sort_save.Close
					end if
					Set sort_save = fso.CreateTextFile(server.mappath("/Job/"&pageName&".html"))
					sort_save.Write pencat
					sort_save.Close
					Response.write "<meta http-equiv=Refresh content='0; URL=maketrade.asp?page="&currentPage+1&"'>"
				else
					Hope_body=""
									
					'替换模版中的标签函数^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
				
					pencat=Hope_HtmlResult(Web_str)
					'进行静态页面的生成^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
						
					Set sort_save = fso.CreateTextFile(server.mappath("/Job/index.html"))
					sort_save.Write pencat
					sort_save.Close
				end if
				'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^end分页结束
				Conn.close
				Set Conn=nothing
				
			
       '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	   
  
		
%>